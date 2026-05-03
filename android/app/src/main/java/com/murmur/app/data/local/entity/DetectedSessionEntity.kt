package com.murmur.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "detected_sessions",
    indices = [
        Index(value = ["source_platform"]),
        Index(value = ["tool_id"]),
        Index(value = ["local_date"]),
        Index(value = ["started_at"]),
        Index(value = ["status"])
    ]
)
data class DetectedSessionEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "source_platform")
    val sourcePlatform: String = "android",

    @ColumnInfo(name = "source_kind")
    val sourceKind: String = "app",

    @ColumnInfo(name = "tool_id")
    val toolId: String = "",

    @ColumnInfo(name = "tool_name")
    val toolName: String = "",

    @ColumnInfo(name = "package_name")
    val packageName: String = "",

    @ColumnInfo(name = "detected_at")
    val detectedAt: Long = 0,

    @ColumnInfo(name = "started_at")
    val startedAt: Long = 0,

    @ColumnInfo(name = "ended_at")
    val endedAt: Long = 0,

    @ColumnInfo(name = "active_seconds")
    val activeSeconds: Long = 0,

    @ColumnInfo(name = "local_date")
    val localDate: String = "",

    @ColumnInfo(name = "status")
    val status: String = "suspected",

    @ColumnInfo(name = "confidence")
    val confidence: Float = 0.0f,

    @ColumnInfo(name = "created_at")
    val createdAt: Long = 0,

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = 0
)
