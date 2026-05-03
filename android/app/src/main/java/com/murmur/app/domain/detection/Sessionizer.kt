package com.murmur.app.domain.detection

import com.murmur.app.domain.model.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Converts raw usage events into detected sessions.
 * Implements the same sessionization logic as other Murmur platforms:
 *
 * Rules:
 * - < 15s: discard (too short to be meaningful)
 * - 15-30s: mark as SUSPECTED
 * - > 30s: normal ACTIVE session
 * - 3-minute merge window: sessions of the same tool within 3 minutes are merged
 * - Cross-midnight split: sessions spanning midnight are split
 */
class Sessionizer {

    companion object {
        private const val MIN_SESSION_SECONDS = 15L
        private const val SUSPECTED_THRESHOLD_SECONDS = 30L
        private const val MERGE_WINDOW_MS = 3 * 60 * 1000L // 3 minutes

        const val CROSS_MIDNIGHT_START_HOUR = 23
        const val CROSS_MIDNIGHT_SPLIT_MINUTE = 50
    }

    /**
     * Process a list of RawEvents and convert them into DetectedSessions.
     */
    fun processEvents(
        events: List<RawEvent>,
        matcher: ToolMatcher
    ): List<DetectedSession> {
        if (events.isEmpty()) return emptyList()

        // Step 1: Pair foreground/background events to form raw sessions
        val rawSessions = pairEvents(events)

        // Step 2: Match each raw session to a tool
        val matchedSessions = rawSessions.mapNotNull { rawSession ->
            val matchResult = matcher.match(rawSession.foregroundEvent)
            if (matchResult.ignored || matchResult.tool == null) {
                // Only create sessions for unmatched if they might be AI tools
                // For now, skip unmatched sessions
                null
            } else {
                val durationMs = rawSession.backgroundEvent?.timestamp?.minus(rawSession.foregroundEvent.timestamp)
                    ?: 0L
                val durationSeconds = durationMs / 1000

                // Discard sessions shorter than MIN_SESSION_SECONDS
                if (durationSeconds < MIN_SESSION_SECONDS) return@mapNotNull null

                val status = when {
                    !matchResult.needsConfirmation && durationSeconds >= SUSPECTED_THRESHOLD_SECONDS -> SessionStatus.ACTIVE
                    else -> SessionStatus.SUSPECTED
                }

                val startedAt = rawSession.foregroundEvent.timestamp
                val endedAt = rawSession.backgroundEvent?.timestamp ?: startedAt + durationMs

                DetectedSession(
                    sourcePlatform = SourcePlatform.MOBILE_APP,
                    sourceKind = SourceKind.FOREGROUND_APP,
                    toolId = matchResult.tool!!.id,
                    toolName = matchResult.tool!!.name,
                    packageName = rawSession.foregroundEvent.packageName,
                    detectedAt = System.currentTimeMillis(),
                    startedAt = startedAt,
                    endedAt = endedAt,
                    activeSeconds = durationSeconds,
                    localDate = timestampToDate(startedAt),
                    status = status,
                    confidence = matchResult.confidence,
                    createdAt = System.currentTimeMillis(),
                    updatedAt = System.currentTimeMillis()
                )
            }
        }

        // Step 3: Merge sessions of the same tool within MERGE_WINDOW_MS
        val mergedSessions = mergeNearbySessions(matchedSessions)

        // Step 4: Split cross-midnight sessions
        val splitSessions = splitCrossMidnight(mergedSessions)

        return splitSessions
    }

    /**
     * Pair FOREGROUND and BACKGROUND events into raw sessions.
     */
    private fun pairEvents(events: List<RawEvent>): List<RawSession> {
        val sessions = mutableListOf<RawSession>()
        val sorted = events.sortedBy { it.timestamp }

        var pendingForeground: RawEvent? = null

        for (event in sorted) {
            when (event.eventType) {
                RawEventType.FOREGROUND -> {
                    // If there was a pending foreground without background, close it
                    if (pendingForeground != null) {
                        sessions.add(RawSession(pendingForeground, null))
                    }
                    pendingForeground = event
                }
                RawEventType.BACKGROUND -> {
                    if (pendingForeground != null &&
                        pendingForeground.packageName == event.packageName) {
                        sessions.add(RawSession(pendingForeground, event))
                        pendingForeground = null
                    } else {
                        // Background without matching foreground — skip
                    }
                }
            }
        }

        // Add any remaining foreground without background
        if (pendingForeground != null) {
            sessions.add(RawSession(pendingForeground, null))
        }

        return sessions
    }

    /**
     * Merge sessions of the same tool that are within MERGE_WINDOW_MS of each other.
     */
    private fun mergeNearbySessions(sessions: List<DetectedSession>): List<DetectedSession> {
        if (sessions.isEmpty()) return emptyList()

        val merged = mutableListOf<DetectedSession>()
        var current = sessions.first()

        for (i in 1 until sessions.size) {
            val next = sessions[i]

            val isSameTool = current.toolId == next.toolId
            val isWithinWindow = next.startedAt - current.endedAt <= MERGE_WINDOW_MS

            if (isSameTool && isWithinWindow) {
                // Merge: extend end time and sum duration
                val mergedActiveSeconds = current.activeSeconds + next.activeSeconds +
                    ((next.startedAt - current.endedAt) / 1000)
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

    /**
     * Split sessions that cross midnight boundaries.
     * A session is split if it starts before midnight and ends after midnight,
     * or if it spans near midnight (23:50 - 00:10).
     */
    private fun splitCrossMidnight(sessions: List<DetectedSession>): List<DetectedSession> {
        val result = mutableListOf<DetectedSession>()

        for (session in sessions) {
            val startInstant = Instant.ofEpochMilli(session.startedAt)
            val endInstant = Instant.ofEpochMilli(session.endedAt)
            val startDate = LocalDate.ofInstant(startInstant, ZoneId.systemDefault())
            val endDate = LocalDate.ofInstant(endInstant, ZoneId.systemDefault())

            if (startDate == endDate) {
                // Does not cross midnight, keep as is
                result.add(session)
            } else {
                // Crosses midnight: split into two sessions
                val midnightMillis = endDate.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()

                val beforeMidnightSeconds = (midnightMillis - session.startedAt) / 1000
                val afterMidnightSeconds = (session.endedAt - midnightMillis) / 1000

                // First part (before midnight)
                if (beforeMidnightSeconds >= MIN_SESSION_SECONDS) {
                    result.add(
                        session.copy(
                            endedAt = midnightMillis,
                            activeSeconds = beforeMidnightSeconds,
                            localDate = startDate.toString(),
                            status = if (beforeMidnightSeconds < SUSPECTED_THRESHOLD_SECONDS)
                                SessionStatus.SUSPECTED else session.status,
                            id = 0, // New entity
                            updatedAt = System.currentTimeMillis()
                        )
                    )
                }

                // Second part (after midnight)
                if (afterMidnightSeconds >= MIN_SESSION_SECONDS) {
                    result.add(
                        session.copy(
                            startedAt = midnightMillis,
                            activeSeconds = afterMidnightSeconds,
                            localDate = endDate.toString(),
                            status = if (afterMidnightSeconds < SUSPECTED_THRESHOLD_SECONDS)
                                SessionStatus.SUSPECTED else session.status,
                            id = 0, // New entity
                            updatedAt = System.currentTimeMillis()
                        )
                    )
                }
            }
        }

        return result
    }

    private fun timestampToDate(timestamp: Long): String {
        return Instant.ofEpochMilli(timestamp)
            .atZone(ZoneId.systemDefault())
            .toLocalDate()
            .toString()
    }

    /**
     * Internal representation of a raw (foreground, background) event pair.
     */
    private data class RawSession(
        val foregroundEvent: RawEvent,
        val backgroundEvent: RawEvent?
    )
}
