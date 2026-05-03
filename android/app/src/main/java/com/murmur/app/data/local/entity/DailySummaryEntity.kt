package com.murmur.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "daily_summaries",
    indices = [
        Index(value = ["local_date"], unique = true)
    ]
)
data class DailySummaryEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "local_date")
    val localDate: String = "",

    @ColumnInfo(name = "total_sessions")
    val totalSessions: Int = 0,

    @ColumnInfo(name = "total_active_seconds")
    val totalActiveSeconds: Long = 0,

    @ColumnInfo(name = "completed_sessions")
    val completedSessions: Int = 0,

    @ColumnInfo(name = "pending_sessions")
    val pendingSessions: Int = 0,

    @ColumnInfo(name = "net_gain_seconds")
    val netGainSeconds: Long = 0,

    @ColumnInfo(name = "fatigue_score")
    val fatigueScore: Int = 0,

    @ColumnInfo(name = "extra_cost_seconds")
    val extraCostSeconds: Long = 0,

    @ColumnInfo(name = "time_saved_seconds")
    val timeSavedSeconds: Long = 0,

    @ColumnInfo(name = "extra_cost_breakdown")
    val extraCostBreakdown: String = "{}",

    @ColumnInfo(name = "time_saved_breakdown")
    val timeSavedBreakdown: String = "{}",

    @ColumnInfo(name = "created_at")
    val createdAt: Long = 0,

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = 0
)
