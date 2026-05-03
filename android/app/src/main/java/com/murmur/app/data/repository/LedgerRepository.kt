package com.murmur.app.data.repository

import com.murmur.app.data.local.dao.DailySummaryDao
import com.murmur.app.data.local.dao.LedgerEntryDao
import com.murmur.app.data.local.entity.DailySummaryEntity
import com.murmur.app.data.local.entity.LedgerEntryEntity
import com.murmur.app.domain.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.time.LocalDate

class LedgerRepository(
    private val entryDao: LedgerEntryDao,
    private val sessionDao: com.murmur.app.data.local.dao.DetectedSessionDao,
    private val summaryDao: DailySummaryDao
) {

    fun getEntriesByDate(localDate: String): Flow<List<LedgerEntry>> {
        return entryDao.getEntriesByDate(localDate).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    fun getEntriesByDateRange(startDate: String, endDate: String): Flow<List<LedgerEntry>> {
        return entryDao.getEntriesByDateRange(startDate, endDate).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    suspend fun getEntriesByDateRangeSync(startDate: String, endDate: String): List<LedgerEntry> {
        return entryDao.getEntriesByDateRangeSync(startDate, endDate).map { it.toDomain() }
    }

    fun getEntriesByTool(toolId: String): Flow<List<LedgerEntry>> {
        return entryDao.getEntriesByTool(toolId).map { entities ->
            entities.map { it.toDomain() }
        }
    }

    suspend fun getEntryById(id: Long): LedgerEntry? {
        return entryDao.getEntryById(id)?.toDomain()
    }

    suspend fun getAggregates(startDate: String, endDate: String): com.murmur.app.data.local.dao.LedgerAggregates {
        return entryDao.getAggregates(startDate, endDate)
    }

    suspend fun getAggregatesByDate(localDate: String): com.murmur.app.data.local.dao.LedgerAggregates {
        return entryDao.getAggregatesByDate(localDate)
    }

    suspend fun getToolDistribution(startDate: String, endDate: String): List<ToolUsage> {
        val rows = entryDao.getToolDistribution(startDate, endDate)
        val total = rows.sumOf { it.cnt }
        return rows.map { row ->
            ToolUsage(
                toolId = row.tool_id,
                toolName = row.tool_id,
                sessionCount = row.cnt,
                totalSeconds = row.totalSec,
                percentage = if (total > 0) row.cnt.toFloat() / total else 0.0f
            )
        }
    }

    suspend fun getPlatformDistribution(startDate: String, endDate: String): Map<String, Int> {
        val rows = entryDao.getPlatformDistribution(startDate, endDate)
        return rows.associate { it.source_platform to it.cnt }
    }

    suspend fun insertEntry(entry: LedgerEntry, updateSummary: Boolean = true): Long =
        withContext(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            val entity = entry.copy(createdAt = now, updatedAt = now).toEntity()
            val id = entryDao.insert(entity)

            // Update session status to COMPLETED
            if (entry.sessionId > 0) {
                sessionDao.updateStatus(entry.sessionId, SessionStatus.COMPLETED.value, now)
            }

            // Recalculate daily summary
            if (updateSummary) {
                recalculateDailySummary(entry.localDate)
            }

            id
        }

    suspend fun updateEntry(entry: LedgerEntry) = withContext(Dispatchers.IO) {
        val entity = entry.copy(updatedAt = System.currentTimeMillis()).toEntity()
        entryDao.update(entity)
        recalculateDailySummary(entry.localDate)
    }

    suspend fun deleteEntry(id: Long) = withContext(Dispatchers.IO) {
        entryDao.deleteById(id)
    }

    suspend fun deleteAll() = withContext(Dispatchers.IO) {
        entryDao.deleteAll()
    }

    private suspend fun recalculateDailySummary(localDate: String) {
        val sessions = sessionDao.getSessionsByDateSync(localDate)
        val entries = entryDao.getEntriesByDateRangeSync(localDate, localDate)
        val aggregates = entryDao.getAggregatesByDate(localDate)

        val now = System.currentTimeMillis()
        val summary = DailySummaryEntity(
            localDate = localDate,
            totalSessions = sessions.size,
            totalActiveSeconds = sessions.sumOf { it.activeSeconds },
            completedSessions = sessions.count { it.status == "completed" },
            pendingSessions = sessions.count { it.status == "pending" || it.status == "suspected" },
            netGainSeconds = aggregates.totalNetGain,
            fatigueScore = 0, // Will be calculated separately
            extraCostSeconds = aggregates.totalExtraCost,
            timeSavedSeconds = aggregates.totalTimeSaved,
            extraCostBreakdown = "{}",
            timeSavedBreakdown = "{}",
            createdAt = now,
            updatedAt = now
        )
        summaryDao.insertOrUpdate(summary)
    }

    // Extension functions
    private fun LedgerEntryEntity.toDomain(): LedgerEntry {
        return LedgerEntry(
            id = id,
            sessionId = sessionId,
            toolId = toolId,
            toolName = toolName,
            sourcePlatform = SourcePlatform.fromString(sourcePlatform),
            localDate = localDate,
            activeSeconds = activeSeconds,
            useCase = useCase,
            quality = OutputQuality.fromString(quality),
            mood = UserMood.fromString(mood),
            timeSavedSeconds = timeSavedSeconds,
            extraCostSeconds = extraCostSeconds,
            netGainSeconds = netGainSeconds,
            hasRework = hasRework,
            inputCount = inputCount,
            outputCount = outputCount,
            notes = notes,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }

    private fun LedgerEntry.toEntity(): LedgerEntryEntity {
        return LedgerEntryEntity(
            id = id,
            sessionId = sessionId,
            toolId = toolId,
            toolName = toolName,
            sourcePlatform = sourcePlatform.value,
            localDate = localDate,
            activeSeconds = activeSeconds,
            useCase = useCase,
            quality = quality.value,
            mood = mood.value,
            timeSavedSeconds = timeSavedSeconds,
            extraCostSeconds = extraCostSeconds,
            netGainSeconds = netGainSeconds,
            hasRework = hasRework,
            inputCount = inputCount,
            outputCount = outputCount,
            notes = notes,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }
}
