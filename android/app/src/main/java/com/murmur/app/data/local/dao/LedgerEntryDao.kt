package com.murmur.app.data.local.dao

import androidx.room.*
import com.murmur.app.data.local.entity.LedgerEntryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface LedgerEntryDao {

    @Query("SELECT * FROM ledger_entries WHERE local_date = :localDate ORDER BY created_at DESC")
    fun getEntriesByDate(localDate: String): Flow<List<LedgerEntryEntity>>

    @Query("SELECT * FROM ledger_entries WHERE local_date BETWEEN :startDate AND :endDate ORDER BY created_at DESC")
    fun getEntriesByDateRange(startDate: String, endDate: String): Flow<List<LedgerEntryEntity>>

    @Query("SELECT * FROM ledger_entries WHERE local_date BETWEEN :startDate AND :endDate ORDER BY created_at DESC")
    suspend fun getEntriesByDateRangeSync(startDate: String, endDate: String): List<LedgerEntryEntity>

    @Query("SELECT * FROM ledger_entries WHERE tool_id = :toolId ORDER BY created_at DESC")
    fun getEntriesByTool(toolId: String): Flow<List<LedgerEntryEntity>>

    @Query("SELECT * FROM ledger_entries WHERE session_id = :sessionId")
    suspend fun getEntryBySessionId(sessionId: Long): LedgerEntryEntity?

    @Query("SELECT * FROM ledger_entries WHERE id = :id")
    suspend fun getEntryById(id: Long): LedgerEntryEntity?

    @Query("""
        SELECT
            COALESCE(SUM(time_saved_seconds), 0) as totalTimeSaved,
            COALESCE(SUM(extra_cost_seconds), 0) as totalExtraCost,
            COALESCE(SUM(net_gain_seconds), 0) as totalNetGain,
            COALESCE(SUM(CASE WHEN has_rework = 1 THEN 1 ELSE 0 END), 0) as totalRework
        FROM ledger_entries
        WHERE local_date BETWEEN :startDate AND :endDate
    """)
    suspend fun getAggregates(startDate: String, endDate: String): LedgerAggregates

    @Query("""
        SELECT
            COALESCE(SUM(time_saved_seconds), 0) as totalTimeSaved,
            COALESCE(SUM(extra_cost_seconds), 0) as totalExtraCost,
            COALESCE(SUM(net_gain_seconds), 0) as totalNetGain,
            COALESCE(SUM(CASE WHEN has_rework = 1 THEN 1 ELSE 0 END), 0) as totalRework
        FROM ledger_entries
        WHERE local_date = :localDate
    """)
    suspend fun getAggregatesByDate(localDate: String): LedgerAggregates

    @Query("SELECT COUNT(*) FROM ledger_entries WHERE local_date = :localDate")
    suspend fun getCountByDate(localDate: String): Int

    @Query("SELECT * FROM ledger_entries ORDER BY created_at DESC LIMIT :limit")
    suspend fun getRecentEntries(limit: Int = 50): List<LedgerEntryEntity>

    @Query("SELECT tool_id, COUNT(*) as cnt, SUM(active_seconds) as totalSec FROM ledger_entries WHERE local_date BETWEEN :startDate AND :endDate GROUP BY tool_id")
    suspend fun getToolDistribution(startDate: String, endDate: String): List<ToolDistributionRow>

    @Query("SELECT source_platform, COUNT(*) as cnt FROM ledger_entries WHERE local_date BETWEEN :startDate AND :endDate GROUP BY source_platform")
    suspend fun getPlatformDistribution(startDate: String, endDate: String): List<PlatformDistributionRow>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(entry: LedgerEntryEntity): Long

    @Update
    suspend fun update(entry: LedgerEntryEntity)

    @Query("DELETE FROM ledger_entries WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM ledger_entries")
    suspend fun deleteAll()
}

data class LedgerAggregates(
    val totalTimeSaved: Long = 0,
    val totalExtraCost: Long = 0,
    val totalNetGain: Long = 0,
    val totalRework: Int = 0
)

data class ToolDistributionRow(
    val tool_id: String,
    val cnt: Int,
    val totalSec: Long
)

data class PlatformDistributionRow(
    val source_platform: String,
    val cnt: Int
)
