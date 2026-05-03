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
import java.time.ZoneId

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

        // Mark source as merged
        val now = System.currentTimeMillis()
        dao.updateStatus(sourceId, SessionStatus.MERGED.value, now)
    }

    suspend fun getDistinctTools(startDate: String, endDate: String): List<String> {
        return dao.getDistinctTools(startDate, endDate)
    }

    // Extension functions for entity <-> domain conversion
    private fun DetectedSessionEntity.toDomain(): DetectedSession {
        return DetectedSession(
            id = id,
            sourcePlatform = SourcePlatform.fromString(sourcePlatform),
            sourceKind = SourceKind.fromString(sourceKind),
            toolId = toolId,
            toolName = toolName,
            packageName = packageName,
            detectedAt = detectedAt,
            startedAt = startedAt,
            endedAt = endedAt,
            activeSeconds = activeSeconds,
            localDate = localDate,
            status = SessionStatus.fromString(status),
            confidence = confidence,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }

    private fun DetectedSession.toEntity(): DetectedSessionEntity {
        return DetectedSessionEntity(
            id = id,
            sourcePlatform = sourcePlatform.value,
            sourceKind = sourceKind.value,
            toolId = toolId,
            toolName = toolName,
            packageName = packageName,
            detectedAt = detectedAt,
            startedAt = startedAt,
            endedAt = endedAt,
            activeSeconds = activeSeconds,
            localDate = localDate,
            status = status.value,
            confidence = confidence,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }
}
