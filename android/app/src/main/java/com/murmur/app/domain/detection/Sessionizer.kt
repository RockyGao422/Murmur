package com.murmur.app.domain.detection

import android.content.Context
import android.content.SharedPreferences
import com.murmur.app.domain.model.*
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * Converts raw usage events into detected sessions.
 * Aligned with canonical detected-session schema — generates UUID, fingerprint, timezone, etc.
 *
 * Rules:
 * - < 15s: discard
 * - 15-30s: suspect
 * - > 30s: pending
 * - 3-min merge window
 * - Cross-midnight split
 */
class Sessionizer(context: Context) {

    companion object {
        private const val MIN_SESSION_SECONDS = 15L
        private const val SUSPECTED_THRESHOLD_SECONDS = 30L
        private const val MERGE_WINDOW_MS = 3 * 60 * 1000L
        private const val PREFS_NAME = "murmur_sessionizer"
        private const val KEY_OPEN_STATE = "open_foreground_state"
        private const val KEY_DEVICE_ID = "murmur_device_id"
    }

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val deviceId: String by lazy { loadOrCreateDeviceId() }
    private val appContext = context.applicationContext

    /**
     * Load persisted open foreground state (survives across Worker runs).
     */
    fun loadOpenForegroundState(): OpenForegroundState? {
        val json = prefs.getString(KEY_OPEN_STATE, null) ?: return null
        return try {
            val parts = json.split("::")
            if (parts.size >= 3) {
                OpenForegroundState(
                    packageName = parts[0],
                    startedAt = parts[1].toLong(),
                    toolId = parts[2]
                )
            } else null
        } catch (_: Exception) { null }
    }

    /**
     * Save open foreground state for next Worker run.
     */
    fun saveOpenForegroundState(state: OpenForegroundState?) {
        if (state == null) {
            prefs.edit().remove(KEY_OPEN_STATE).apply()
        } else {
            val json = "${state.packageName}::${state.startedAt}::${state.toolId}"
            prefs.edit().putString(KEY_OPEN_STATE, json).apply()
        }
    }

    /**
     * Process a list of RawEvents and convert them into DetectedSessions.
     * Handles persisted open foreground state from previous worker runs.
     */
    fun processEvents(
        events: List<RawEvent>,
        matcher: ToolMatcher
    ): List<DetectedSession> {
        if (events.isEmpty() && loadOpenForegroundState() == null) return emptyList()

        // Load persisted open state and merge into events
        val openState = loadOpenForegroundState()
        val allEvents = mutableListOf<RawEvent>()
        if (openState != null) {
            // Insert the open foreground as a starting event
            allEvents.add(
                RawEvent(
                    packageName = openState.packageName,
                    eventType = RawEventType.FOREGROUND,
                    timestamp = openState.startedAt
                )
            )
        }
        allEvents.addAll(events)

        // Step 1: Pair foreground/background events
        val rawSessions = pairEvents(allEvents)

        // Step 2: Match each raw session to a tool
        val matchedSessions = rawSessions.mapNotNull { rawSession ->
            val matchResult = matcher.match(rawSession.foregroundEvent)
            if (matchResult.ignored || matchResult.tool == null) {
                null
            } else {
                val durationMs = rawSession.backgroundEvent?.timestamp?.minus(rawSession.foregroundEvent.timestamp)
                    ?: (System.currentTimeMillis() - rawSession.foregroundEvent.timestamp).coerceAtLeast(0)
                val durationSeconds = durationMs / 1000

                if (durationSeconds < MIN_SESSION_SECONDS) return@mapNotNull null

                val status = when {
                    !matchResult.needsConfirmation && durationSeconds >= SUSPECTED_THRESHOLD_SECONDS -> SessionStatus.PENDING
                    else -> SessionStatus.SUSPECTED
                }

                val startedAt = rawSession.foregroundEvent.timestamp
                val endedAt = rawSession.backgroundEvent?.timestamp ?: (startedAt + durationMs)
                val now = System.currentTimeMillis()
                val zoneId = ZoneId.systemDefault()
                val startInstant = Instant.ofEpochMilli(startedAt)
                val localDate = LocalDate.ofInstant(startInstant, zoneId).toString()
                val hour = startInstant.atZone(zoneId).toLocalTime().hour
                val isNight = hour >= 22 || hour < 6

                val canonicalId = UUID.randomUUID().toString()

                DetectedSession(
                    id = 0,
                    canonicalId = canonicalId,
                    sourcePlatform = SourcePlatform.ANDROID,
                    sourceKind = SourceKind.APP,
                    detectorId = "android.usagestats",
                    toolId = matchResult.tool!!.id,
                    toolName = matchResult.tool!!.name,
                    rawAppName = getAppLabel(rawSession.foregroundEvent.packageName),
                    packageName = rawSession.foregroundEvent.packageName,
                    rawPackageName = rawSession.foregroundEvent.packageName,
                    rawDomain = null,
                    rawUrlPattern = null,
                    detectedAt = now,
                    startedAt = startedAt,
                    endedAt = endedAt,
                    activeSeconds = durationSeconds,
                    idleSeconds = 0,
                    localDate = localDate,
                    timezone = zoneId.id,
                    isNight = isNight,
                    status = status,
                    confidence = matchResult.confidence,
                    mergedIntoSessionId = null,
                    promptCount = null,
                    sourceFingerprint = null, // set after merge/split
                    deviceId = deviceId,
                    syncStatus = "local_only",
                    createdAt = now,
                    updatedAt = now
                )
            }
        }

        // Step 3: Merge adjacent
        val mergedSessions = mergeNearbySessions(matchedSessions)

        // Step 4: Split cross-midnight
        val splitSessions = splitCrossMidnight(mergedSessions)

        // Step 5: Compute fingerprints
        val finalized = splitSessions.map { s ->
            s.copy(sourceFingerprint = computeFingerprint(s))
        }

        // Update open foreground state: if last event was foreground without background, persist
        val lastEvent = events.lastOrNull()
        if (lastEvent != null && lastEvent.eventType == RawEventType.FOREGROUND) {
            val match = matcher.match(lastEvent)
            if (match.tool != null && !match.ignored) {
                saveOpenForegroundState(
                    OpenForegroundState(
                        packageName = lastEvent.packageName,
                        startedAt = lastEvent.timestamp,
                        toolId = match.tool.id
                    )
                )
            } else {
                saveOpenForegroundState(null)
            }
        } else {
            saveOpenForegroundState(null)
        }

        return finalized
    }

    /**
     * Pair FOREGROUND and BACKGROUND events into raw sessions.
     * Incorporates persisted open state.
     */
    private fun pairEvents(events: List<RawEvent>): List<RawSession> {
        val sessions = mutableListOf<RawSession>()
        val sorted = events.sortedBy { it.timestamp }

        var pendingForeground: RawEvent? = null

        for (event in sorted) {
            when (event.eventType) {
                RawEventType.FOREGROUND -> {
                    if (pendingForeground != null) {
                        // Close previous foreground at new foreground's time to prevent over-counting
                        val closureEvent = RawEvent(
                            packageName = pendingForeground.packageName,
                            eventType = RawEventType.BACKGROUND,
                            timestamp = event.timestamp
                        )
                        sessions.add(RawSession(pendingForeground, closureEvent))
                    }
                    pendingForeground = event
                }
                RawEventType.BACKGROUND -> {
                    if (pendingForeground != null &&
                        pendingForeground.packageName == event.packageName) {
                        sessions.add(RawSession(pendingForeground, event))
                        pendingForeground = null
                    }
                }
            }
        }

        // Persist remaining unclosed foreground as open state for next run
        // (it will be paired when the next worker run sees the background or next foreground)

        return sessions
    }

    private fun mergeNearbySessions(sessions: List<DetectedSession>): List<DetectedSession> {
        if (sessions.isEmpty()) return emptyList()
        if (sessions.size == 1) return sessions

        val sorted = sessions.sortedBy { it.startedAt }
        val merged = mutableListOf<DetectedSession>()
        var current = sorted.first()

        for (i in 1 until sorted.size) {
            val next = sorted[i]
            val isSameTool = current.toolId == next.toolId
            val isWithinWindow = next.startedAt - current.endedAt <= MERGE_WINDOW_MS

            if (isSameTool && isWithinWindow) {
                // Sum active seconds only — gap time is NOT active usage
                val mergedActiveSeconds = current.activeSeconds + next.activeSeconds
                current = current.copy(
                    endedAt = next.endedAt,
                    activeSeconds = mergedActiveSeconds,
                    confidence = maxOf(current.confidence, next.confidence),
                    updatedAt = System.currentTimeMillis()
                )
            } else {
                merged.add(current)
                current = next
            }
        }
        merged.add(current)
        return merged
    }

    private fun splitCrossMidnight(sessions: List<DetectedSession>): List<DetectedSession> {
        val result = mutableListOf<DetectedSession>()

        for (session in sessions) {
            val startInstant = Instant.ofEpochMilli(session.startedAt)
            val endInstant = Instant.ofEpochMilli(session.endedAt)
            val zoneId = ZoneId.of(session.timezone)
            val startDate = LocalDate.ofInstant(startInstant, zoneId)
            val endDate = LocalDate.ofInstant(endInstant, zoneId)

            if (startDate == endDate) {
                result.add(session)
            } else {
                val midnightMillis = endDate.atStartOfDay(zoneId).toInstant().toEpochMilli()

                val beforeMidnightSeconds = (midnightMillis - session.startedAt) / 1000
                val afterMidnightSeconds = (session.endedAt - midnightMillis) / 1000

                val now = System.currentTimeMillis()

                if (beforeMidnightSeconds >= MIN_SESSION_SECONDS) {
                    val newId = UUID.randomUUID().toString()
                    result.add(
                        session.copy(
                            id = 0,
                            canonicalId = newId,
                            endedAt = midnightMillis,
                            activeSeconds = beforeMidnightSeconds,
                            localDate = startDate.toString(),
                            isNight = isNightHour(zoneId, midnightMillis - 1000),
                            status = if (beforeMidnightSeconds < SUSPECTED_THRESHOLD_SECONDS)
                                SessionStatus.SUSPECTED else session.status,
                            updatedAt = now,
                            sourceFingerprint = null // recomputed later
                        )
                    )
                }

                if (afterMidnightSeconds >= MIN_SESSION_SECONDS) {
                    val newId = UUID.randomUUID().toString()
                    result.add(
                        session.copy(
                            id = 0,
                            canonicalId = newId,
                            startedAt = midnightMillis,
                            activeSeconds = afterMidnightSeconds,
                            localDate = endDate.toString(),
                            isNight = isNightHour(zoneId, midnightMillis),
                            status = if (afterMidnightSeconds < SUSPECTED_THRESHOLD_SECONDS)
                                SessionStatus.SUSPECTED else session.status,
                            updatedAt = now,
                            sourceFingerprint = null
                        )
                    )
                }
            }
        }

        return result
    }

    private fun isNightHour(zoneId: ZoneId, epochMs: Long): Boolean {
        val hour = Instant.ofEpochMilli(epochMs).atZone(zoneId).toLocalTime().hour
        return hour >= 22 || hour < 6
    }

    private fun computeFingerprint(session: DetectedSession): String {
        val parts = listOf(
            session.sourcePlatform.value,
            session.sourceKind.value,
            deviceId,
            session.toolId,
            session.rawPackageName ?: session.packageName,
            (session.startedAt / 5000).toString(),
            (session.endedAt / 5000).toString(),
            session.activeSeconds.toString()
        ).joinToString("|")

        val digest = MessageDigest.getInstance("SHA-256").digest(parts.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun loadOrCreateDeviceId(): String {
        val existing = prefs.getString(KEY_DEVICE_ID, null)
        if (!existing.isNullOrEmpty()) return existing
        val newId = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_DEVICE_ID, newId).apply()
        return newId
    }

    private fun getAppLabel(packageName: String): String? {
        return try {
            val pm = appContext.packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) { null }
    }

    data class OpenForegroundState(
        val packageName: String,
        val startedAt: Long,
        val toolId: String
    )

    private data class RawSession(
        val foregroundEvent: RawEvent,
        val backgroundEvent: RawEvent?
    )
}
