package com.murmur.app.data.repository

import com.murmur.app.data.local.dao.DetectedSessionDao
import com.murmur.app.data.local.entity.DetectedSessionEntity
import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.SessionStatus
import com.murmur.app.domain.model.SourceKind
import com.murmur.app.domain.model.SourcePlatform
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.time.LocalDate

class SessionRepository(private val dao: DetectedSessionDao) {

    fun getSessionsByDate(localDate: String): Flow<List<DetectedSession>> {
        return dao.getSessionsByDate(localDate).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    fun getPendingSessions(): Flow<List<DetectedSession>> {
        return dao.getPendingSessions().map { entities ->
            entities.map { it.toDomain() }
        }
    }

    fun getSessionsByDateRange(startDate: String, endDate: String): Flow<List<DetectedSession>> {
        return dao.getSessionsByDateRange(startDate, endDate).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    suspend fun getSessionsByDateRangeSync(startDate: String, endDate: String): List<DetectedSession> {
        return dao.getSessionsByDateRangeSync(startDate, endDate).map { it.toDomain() }
    }

    suspend fun getSessionById(id: Long): DetectedSession? {
        return dao.getSessionById(id)?.toDomain()
    }

    suspend fun insertSession(session: DetectedSession): Long = withContext(Dispatchers.IO) {
        dao.insert(session.toEntity())
    }

    suspend fun insertSessions(sessions: List<DetectedSession>): List<Long> = withContext(Dispatchers.IO) {
        dao.insertAll(sessions.map { it.toEntity() })
    }

    /**
     * Upsert by fingerprint — checks for existing session with same source_fingerprint before inserting.
     * Returns the existing session ID if found, or the new ID if inserted.
     */
    suspend fun upsertByFingerprint(session: DetectedSession): Long = withContext(Dispatchers.IO) {
        val fingerprint = session.sourceFingerprint
        if (!fingerprint.isNullOrEmpty()) {
            val existing = dao.getByFingerprint(fingerprint)
            if (existing != null) {
                val existingStatus = SessionStatus.fromString(existing.status)
                if (existingStatus == SessionStatus.COMPLETED ||
                    existingStatus == SessionStatus.IGNORED ||
                    existingStatus == SessionStatus.MERGED
                ) {
                    return@withContext existing.id
                }

                // Update existing session with any new data
                dao.update(
                    existing.copy(
                        activeSeconds = session.activeSeconds,
                        endedAt = session.endedAt,
                        status = session.status.value,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                return@withContext existing.id
            }
        }
        // Also check canonicalId
        if (session.canonicalId.isNotEmpty()) {
            // Insert with REPLACE strategy handles this
        }
        dao.insert(session.toEntity())
    }

    suspend fun upsertSessions(sessions: List<DetectedSession>): List<Long> = withContext(Dispatchers.IO) {
        sessions.map { upsertByFingerprint(it) }
    }

    suspend fun updateStatus(id: Long, status: SessionStatus) = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        dao.updateStatus(id, status.value, now)
    }

    suspend fun updateSession(session: DetectedSession) = withContext(Dispatchers.IO) {
        dao.update(session.toEntity())
    }

    suspend fun deleteSession(id: Long) = withContext(Dispatchers.IO) {
        dao.deleteById(id)
    }

    suspend fun getTodayStats(): com.murmur.app.data.local.dao.TodayStats {
        val today = LocalDate.now().toString()
        return dao.getTodayStats(today)
    }

    suspend fun getRecentSessions(limit: Int = 50): List<DetectedSession> {
        return dao.getRecentSessions(limit).map { it.toDomain() }
    }

    suspend fun mergeSessions(targetId: Long, sourceId: Long) = withContext(Dispatchers.IO) {
        val target = dao.getSessionById(targetId) ?: return@withContext
        val source = dao.getSessionById(sourceId) ?: return@withContext

        // Merge: extend target's time range and sum active seconds
        val mergedStartedAt = minOf(target.startedAt, source.startedAt)
        val mergedEndedAt = maxOf(target.endedAt, source.endedAt)
        val mergedActiveSeconds = target.activeSeconds + source.activeSeconds

        dao.update(
            target.copy(
                startedAt = mergedStartedAt,
                endedAt = mergedEndedAt,
                activeSeconds = mergedActiveSeconds,
                updatedAt = System.currentTimeMillis()
            )
        )

        // Mark source as merged, linking to target canon ID
        val now = System.currentTimeMillis()
        dao.update(
            source.copy(
                status = SessionStatus.MERGED.value,
                mergedIntoSessionId = target.canonicalId,
                updatedAt = now
            )
        )
    }

    suspend fun getDistinctTools(startDate: String, endDate: String): List<String> {
        return dao.getDistinctTools(startDate, endDate)
    }

    // Extension functions for entity <-> domain conversion
    private fun DetectedSessionEntity.toDomain(): DetectedSession {
        return DetectedSession(
            id = id,
            canonicalId = canonicalId,
            sourcePlatform = SourcePlatform.fromString(sourcePlatform),
            sourceKind = SourceKind.fromString(sourceKind),
            detectorId = detectorId,
            toolId = toolId,
            toolName = toolName,
            rawAppName = rawAppName,
            packageName = rawPackageName ?: "",
            rawPackageName = rawPackageName,
            rawDomain = rawDomain,
            rawUrlPattern = rawUrlPattern,
            detectedAt = detectedAt,
            startedAt = startedAt,
            endedAt = endedAt,
            activeSeconds = activeSeconds,
            idleSeconds = idleSeconds,
            localDate = localDate,
            timezone = timezone,
            isNight = isNight,
            status = SessionStatus.fromString(status),
            confidence = confidence,
            mergedIntoSessionId = mergedIntoSessionId,
            promptCount = promptCount,
            sourceFingerprint = sourceFingerprint,
            deviceId = deviceId,
            syncStatus = syncStatus,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }

    private fun DetectedSession.toEntity(): DetectedSessionEntity {
        return DetectedSessionEntity(
            id = id,
            canonicalId = canonicalId,
            sourcePlatform = sourcePlatform.value,
            sourceKind = sourceKind.value,
            detectorId = detectorId,
            toolId = toolId,
            toolName = toolName,
            rawAppName = rawAppName,
            rawPackageName = rawPackageName ?: packageName,
            rawDomain = rawDomain,
            rawUrlPattern = rawUrlPattern,
            detectedAt = detectedAt,
            startedAt = startedAt,
            endedAt = endedAt,
            activeSeconds = activeSeconds,
            idleSeconds = idleSeconds,
            localDate = localDate,
            timezone = timezone,
            isNight = isNight,
            status = status.value,
            confidence = confidence,
            mergedIntoSessionId = mergedIntoSessionId,
            promptCount = promptCount,
            sourceFingerprint = sourceFingerprint,
            deviceId = deviceId,
            syncStatus = syncStatus,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }
}
