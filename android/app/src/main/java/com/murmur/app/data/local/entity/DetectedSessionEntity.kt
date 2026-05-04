package com.murmur.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "detected_sessions",
    indices = [
        Index(value = ["canonical_id"], unique = true),
        Index(value = ["source_platform"]),
        Index(value = ["tool_id"]),
        Index(value = ["local_date"]),
        Index(value = ["started_at"]),
        Index(value = ["status"]),
        Index(value = ["source_fingerprint"], unique = true)
    ]
)
data class DetectedSessionEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "canonical_id")
    val canonicalId: String = "",

    @ColumnInfo(name = "source_platform")
    val sourcePlatform: String = "android",

    @ColumnInfo(name = "source_kind")
    val sourceKind: String = "app",

    @ColumnInfo(name = "detector_id")
    val detectorId: String = "android.usagestats",

    @ColumnInfo(name = "tool_id")
    val toolId: String = "",

    @ColumnInfo(name = "tool_name")
    val toolName: String = "",

    @ColumnInfo(name = "raw_app_name")
    val rawAppName: String? = null,

    @ColumnInfo(name = "raw_package_name")
    val rawPackageName: String? = null,

    // Legacy column retained for migration compatibility (v1 → v2).
    // Data was migrated to raw_package_name; this column is no longer populated.
    @ColumnInfo(name = "package_name")
    val packageName: String? = null,

    @ColumnInfo(name = "raw_domain")
    val rawDomain: String? = null,

    @ColumnInfo(name = "raw_url_pattern")
    val rawUrlPattern: String? = null,

    @ColumnInfo(name = "detected_at")
    val detectedAt: Long = 0,

    @ColumnInfo(name = "started_at")
    val startedAt: Long = 0,

    @ColumnInfo(name = "ended_at")
    val endedAt: Long = 0,

    @ColumnInfo(name = "active_seconds")
    val activeSeconds: Long = 0,

    @ColumnInfo(name = "idle_seconds")
    val idleSeconds: Long = 0,

    @ColumnInfo(name = "local_date")
    val localDate: String = "",

    @ColumnInfo(name = "timezone")
    val timezone: String = "",

    @ColumnInfo(name = "is_night")
    val isNight: Boolean = false,

    @ColumnInfo(name = "status")
    val status: String = "suspected",

    @ColumnInfo(name = "confidence")
    val confidence: Float = 0.0f,

    @ColumnInfo(name = "merged_into_session_id")
    val mergedIntoSessionId: String? = null,

    @ColumnInfo(name = "prompt_count")
    val promptCount: Int? = null,

    @ColumnInfo(name = "source_fingerprint")
    val sourceFingerprint: String? = null,

    @ColumnInfo(name = "device_id")
    val deviceId: String = "",

    @ColumnInfo(name = "sync_status")
    val syncStatus: String = "local_only",

    @ColumnInfo(name = "created_at")
    val createdAt: Long = 0,

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = 0
)
