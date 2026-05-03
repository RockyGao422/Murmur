package com.murmur.app.data.local.dao

import androidx.room.*
import com.murmur.app.data.local.entity.DailySummaryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface DailySummaryDao {

    @Query("SELECT * FROM daily_summaries WHERE local_date = :localDate")
    suspend fun getByDate(localDate: String): DailySummaryEntity?

    @Query("SELECT * FROM daily_summaries WHERE local_date = :localDate")
    fun getByDateFlow(localDate: String): Flow<DailySummaryEntity?>

    @Query("SELECT * FROM daily_summaries WHERE local_date BETWEEN :startDate AND :endDate ORDER BY local_date ASC")
    suspend fun getRange(startDate: String, endDate: String): List<DailySummaryEntity>

    @Query("SELECT * FROM daily_summaries WHERE local_date BETWEEN :startDate AND :endDate ORDER BY local_date ASC")
    fun getRangeFlow(startDate: String, endDate: String): Flow<List<DailySummaryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(summary: DailySummaryEntity)

    @Update
    suspend fun update(summary: DailySummaryEntity)

    @Transaction
    suspend fun insertOrUpdate(summary: DailySummaryEntity) {
        val existing = getByDate(summary.localDate)
        if (existing != null) {
            update(summary.copy(id = existing.id))
        } else {
            insert(summary)
        }
    }

    @Query("DELETE FROM daily_summaries")
    suspend fun deleteAll()
}
