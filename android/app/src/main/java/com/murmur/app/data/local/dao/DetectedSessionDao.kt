package com.murmur.app.data.local.dao

import androidx.room.*
import com.murmur.app.data.local.entity.DetectedSessionEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DetectedSessionDao {

    @Query("SELECT * FROM detected_sessions WHERE local_date = :localDate ORDER BY started_at DESC")
    fun getSessionsByDate(localDate: String): Flow<List<DetectedSessionEntity>>

    @Query("SELECT * FROM detected_sessions WHERE local_date = :localDate ORDER BY started_at DESC")
    suspend fun getSessionsByDateSync(localDate: String): List<DetectedSessionEntity>

    @Query("SELECT * FROM detected_sessions WHERE status = 'ACTIVE' OR status = 'SUSPECTED' ORDER BY started_at DESC")
    fun getPendingSessions(): Flow<List<DetectedSessionEntity>>

    @Query("SELECT * FROM detected_sessions WHERE status = :status ORDER BY started_at DESC")
    fun getSessionsByStatus(status: String): Flow<List<DetectedSessionEntity>>

    @Query("SELECT * FROM detected_sessions WHERE local_date BETWEEN :startDate AND :endDate ORDER BY started_at DESC")
    fun getSessionsByDateRange(startDate: String, endDate: String): Flow<List<DetectedSessionEntity>>

    @Query("SELECT * FROM detected_sessions WHERE local_date BETWEEN :startDate AND :endDate ORDER BY started_at DESC")
    suspend fun getSessionsByDateRangeSync(startDate: String, endDate: String): List<DetectedSessionEntity>

    @Query("SELECT * FROM detected_sessions WHERE id = :id")
    suspend fun getSessionById(id: Long): DetectedSessionEntity?

    @Query("""
        SELECT
            COUNT(*) as sessionCount,
            COALESCE(SUM(active_seconds), 0) as totalActiveSeconds,
            SUM(CASE WHEN status = 'ACTIVE' OR status = 'SUSPECTED' THEN 1 ELSE 0 END) as pendingCount,
            SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completedCount
        FROM detected_sessions
        WHERE local_date = :localDate
    """)
    suspend fun getTodayStats(localDate: String): TodayStats

    @Query("DELETE FROM detected_sessions WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(session: DetectedSessionEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(sessions: List<DetectedSessionEntity>): List<Long>

    @Update
    suspend fun update(session: DetectedSessionEntity)

    @Query("UPDATE detected_sessions SET status = :status, updated_at = :updatedAt WHERE id = :id")
    suspend fun updateStatus(id: Long, status: String, updatedAt: Long)

    @Query("""
        UPDATE detected_sessions
        SET status = 'MERGED', updated_at = :updatedAt
        WHERE id IN (:ids)
    """)
    suspend fun markAsMerged(ids: List<Long>, updatedAt: Long)

    @Query("SELECT * FROM detected_sessions ORDER BY started_at DESC LIMIT :limit")
    suspend fun getRecentSessions(limit: Int = 50): List<DetectedSessionEntity>

    @Query("SELECT DISTINCT tool_id FROM detected_sessions WHERE local_date BETWEEN :startDate AND :endDate")
    suspend fun getDistinctTools(startDate: String, endDate: String): List<String>

    @Query("SELECT * FROM detected_sessions WHERE tool_id = :toolId ORDER BY started_at DESC LIMIT :limit")
    fun getSessionsByTool(toolId: String, limit: Int = 100): Flow<List<DetectedSessionEntity>>

    @Query("DELETE FROM detected_sessions")
    suspend fun deleteAll()
}

data class TodayStats(
    val sessionCount: Int = 0,
    val totalActiveSeconds: Long = 0,
    val pendingCount: Int = 0,
    val completedCount: Int = 0
)
