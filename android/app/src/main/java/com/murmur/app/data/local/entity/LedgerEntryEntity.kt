package com.murmur.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "ledger_entries",
    indices = [
        Index(value = ["session_id"]),
        Index(value = ["tool_id"]),
        Index(value = ["local_date"]),
        Index(value = ["created_at"])
    ]
)
data class LedgerEntryEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "session_id")
    val sessionId: Long = 0,

    @ColumnInfo(name = "tool_id")
    val toolId: String = "",

    @ColumnInfo(name = "tool_name")
    val toolName: String = "",

    @ColumnInfo(name = "source_platform")
    val sourcePlatform: String = "MOBILE_APP",

    @ColumnInfo(name = "local_date")
    val localDate: String = "",

    @ColumnInfo(name = "active_seconds")
    val activeSeconds: Long = 0,

    @ColumnInfo(name = "use_case")
    val useCase: String = "",

    @ColumnInfo(name = "quality")
    val quality: String = "MINOR_EDITS",

    @ColumnInfo(name = "mood")
    val mood: String = "NEUTRAL",

    @ColumnInfo(name = "time_saved_seconds")
    val timeSavedSeconds: Long = 0,

    @ColumnInfo(name = "extra_cost_seconds")
    val extraCostSeconds: Long = 0,

    @ColumnInfo(name = "net_gain_seconds")
    val netGainSeconds: Long = 0,

    @ColumnInfo(name = "has_rework")
    val hasRework: Boolean = false,

    @ColumnInfo(name = "input_count")
    val inputCount: Int = 0,

    @ColumnInfo(name = "output_count")
    val outputCount: Int = 0,

    @ColumnInfo(name = "notes")
    val notes: String = "",

    @ColumnInfo(name = "created_at")
    val createdAt: Long = 0,

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = 0
)
