package com.murmur.app.domain.model

/**
 * Platform where AI usage was detected. Aligned with shared schema source_platform.
 */
enum class SourcePlatform(val value: String) {
    MACOS("macos"),
    ANDROID("android"),
    BROWSER("browser");

    companion object {
        fun fromString(value: String): SourcePlatform {
            return entries.find { it.value == value }
                ?: entries.find { it.name.equals(value, ignoreCase = true) }
                ?: ANDROID
        }
    }
}

/**
 * Kind of source being tracked. Aligned with shared schema source_kind.
 */
enum class SourceKind(val value: String) {
    APP("app"),
    WEB("web");

    companion object {
        fun fromString(value: String): SourceKind {
            return entries.find { it.value == value }
                ?: entries.find { it.name.equals(value, ignoreCase = true) }
                ?: APP
        }
    }
}

/**
 * Status of a detected session. Aligned with shared schema status.
 */
enum class SessionStatus(val value: String) {
    PENDING("pending"),
    COMPLETED("completed"),
    IGNORED("ignored"),
    MERGED("merged"),
    SUSPECTED("suspected");

    companion object {
        fun fromString(value: String): SessionStatus {
            return entries.find { it.value == value }
                ?: entries.find { it.name.equals(value, ignoreCase = true) }
                ?: PENDING
        }
    }
}

/**
 * Quality rating for AI output.
 */
enum class OutputQuality(val label: String, val value: String, val qualityScore: Int, val qualityPenalty: Int) {
    DIRECT_USE("直接用", "direct_use", 4, 0),
    MINOR_EDIT("小改", "minor_edit", 3, 4),
    MAJOR_EDIT("大改", "major_edit", 2, 9),
    USELESS("没用", "useless", 1, 14);

    companion object {
        fun fromString(value: String): OutputQuality {
            return entries.find { it.value == value }
                ?: entries.find { it.name.equals(value, ignoreCase = true) }
                ?: MINOR_EDIT
        }
    }
}

/**
 * User mood when using AI.
 */
enum class UserMood(val label: String, val value: String, val moodWeight: Int) {
    EASY("轻松", "easy", 0),
    NEUTRAL("中性", "neutral", 2),
    IRRITATED("烦躁", "irritated", 6),
    TIRED("疲倦", "tired", 8),
    ANXIOUS("焦虑", "anxious", 10);

    companion object {
        val moodWeights = mapOf(
            EASY to 1.2f,
            NEUTRAL to 1.0f,
            IRRITATED to 0.8f,
            TIRED to 0.7f,
            ANXIOUS to 0.6f
        )

        fun fromString(value: String): UserMood {
            return try {
                valueOf(value.uppercase())
            } catch (e: IllegalArgumentException) {
                entries.find { it.label == value } ?: NEUTRAL
            }
        }
    }
}

/**
 * Event type for raw usage events.
 */
enum class RawEventType {
    FOREGROUND,
    BACKGROUND
}

/**
 * Confidence level for detection results.
 */
enum class ConfidenceLevel {
    HIGH,
    MEDIUM,
    LOW;

    val colorValue: Long
        get() = when (this) {
            HIGH -> 0xFF4CAF50
            MEDIUM -> 0xFFFFC107
            LOW -> 0xFFF44336
        }

    companion object {
        fun fromScore(score: Float): ConfidenceLevel {
            return when {
                score >= 0.9f -> HIGH
                score >= 0.6f -> MEDIUM
                else -> LOW
            }
        }
    }
}

/**
 * A raw usage event detected by UsageStatsManager.
 */
data class RawEvent(
    val packageName: String,
    val eventType: RawEventType,
    val timestamp: Long
)

/**
 * Result of matching a raw event to a known tool.
 */
data class MatchResult(
    val tool: ToolCatalogItem?,
    val confidence: Float,
    val matchedRule: String = "",
    val ignored: Boolean = false,
    val needsConfirmation: Boolean = false
)

/**
 * Detected session — represents a period of AI tool usage.
 */
data class DetectedSession(
    val id: Long = 0,
    val sourcePlatform: SourcePlatform = SourcePlatform.ANDROID,
    val sourceKind: SourceKind = SourceKind.APP,
    val toolId: String = "",
    val toolName: String = "",
    val packageName: String = "",
    val detectedAt: Long = 0,
    val startedAt: Long = 0,
    val endedAt: Long = 0,
    val activeSeconds: Long = 0,
    val localDate: String = "",
    val status: SessionStatus = SessionStatus.SUSPECTED,
    val confidence: Float = 0.0f,
    val createdAt: Long = 0,
    val updatedAt: Long = 0
)

/**
 * Ledger entry — a completed session with user-provided metadata.
 */
data class LedgerEntry(
    val id: Long = 0,
    val sessionId: Long = 0,
    val toolId: String = "",
    val toolName: String = "",
    val sourcePlatform: SourcePlatform = SourcePlatform.ANDROID,
    val localDate: String = "",
    val activeSeconds: Long = 0,
    val useCase: String = "",
    val quality: OutputQuality = OutputQuality.MINOR_EDIT,
    val mood: UserMood = UserMood.NEUTRAL,
    val timeSavedSeconds: Long = 0,
    val extraCostSeconds: Long = 0,
    val netGainSeconds: Long = 0,
    val hasRework: Boolean = false,
    val inputCount: Int = 0,
    val outputCount: Int = 0,
    val notes: String = "",
    val createdAt: Long = 0,
    val updatedAt: Long = 0
)

/**
 * Tool catalog item — a known AI tool definition.
 */
data class ToolCatalogItem(
    val id: String = "",
    val name: String = "",
    val aliases: List<String> = emptyList(),
    val androidPackageNames: List<String> = emptyList(),
    val webDomains: List<String> = emptyList(),
    val urlPatterns: List<String> = emptyList(),
    val defaultEnabled: Boolean = true,
    val detectionEnabled: Boolean = true,
    val isDefault: Boolean = true,
    val userDefined: Boolean = false,
    val sortOrder: Int = 0,
    val confidencePackageName: Float = 0.98f,
    val confidenceDomain: Float = 0.95f,
    val confidenceUrlPattern: Float = 0.90f,
    val confidenceAppName: Float = 0.85f,
    val confidenceTitle: Float = 0.65f,
    val confidenceUserMapping: Float = 1.0f
)

/**
 * Ignored target — a package or domain to skip during detection.
 */
data class IgnoredTarget(
    val id: Long = 0,
    val packageNameOrDomain: String = "",
    val reason: String = "",
    val createdAt: Long = 0,
    val expiresAt: Long? = null,
    val permanent: Boolean = false
)

/**
 * Daily summary — aggregated stats for a single day.
 */
data class DailySummary(
    val id: Long = 0,
    val localDate: String = "",
    val totalSessions: Int = 0,
    val totalActiveSeconds: Long = 0,
    val completedSessions: Int = 0,
    val pendingSessions: Int = 0,
    val netGainSeconds: Long = 0,
    val fatigueScore: Int = 0,
    val extraCostSeconds: Long = 0,
    val timeSavedSeconds: Long = 0,
    val extraCostBreakdown: String = "{}",
    val timeSavedBreakdown: String = "{}",
    val createdAt: Long = 0,
    val updatedAt: Long = 0
)

/**
 * Draft for creating a ledger entry (used in completion screen).
 */
data class LedgerEntryDraft(
    val sessionId: Long = 0,
    val toolId: String = "",
    val toolName: String = "",
    val sourcePlatform: SourcePlatform = SourcePlatform.ANDROID,
    val localDate: String = "",
    val activeSeconds: Long = 0,
    val useCase: String = "",
    val quality: OutputQuality = OutputQuality.DIRECT_USE,
    val mood: UserMood = UserMood.NEUTRAL,
    val inputCount: Int = 1,
    val outputCount: Int = 1,
    val notes: String = ""
)

/**
 * Calculated result from EntryCalculator.
 */
data class CalculatedEntry(
    val timeSavedSeconds: Long,
    val extraCostSeconds: Long,
    val netGainSeconds: Long,
    val hasRework: Boolean
)

/**
 * Weekly review result with insights.
 */
data class WeeklyReview(
    val startDate: String = "",
    val endDate: String = "",
    val totalSessions: Int = 0,
    val totalActiveSeconds: Long = 0,
    val completedSessions: Int = 0,
    val netGainSeconds: Long = 0,
    val avgFatigueScore: Int = 0,
    val topTools: List<ToolUsage> = emptyList(),
    val insights: List<Insight> = emptyList(),
    val comparisonWithPrevious: String = ""
)

/**
 * Tool usage stats within a period.
 */
data class ToolUsage(
    val toolId: String = "",
    val toolName: String = "",
    val sessionCount: Int = 0,
    val totalSeconds: Long = 0,
    val percentage: Float = 0.0f
)

/**
 * An insight from the weekly review engine.
 */
data class Insight(
    val title: String = "",
    val description: String = "",
    val type: InsightType = InsightType.NEUTRAL
)

enum class InsightType {
    POSITIVE,
    NEUTRAL,
    WARNING
}

/**
 * Use case categories.
 */
enum class UseCase(val label: String) {
    CODING("编程"),
    WRITING("写作"),
    RESEARCH("研究"),
    TRANSLATION("翻译"),
    DESIGN("设计"),
    STUDY("学习"),
    CHAT("聊天"),
    OTHER("其他");

    companion object {
        fun fromString(value: String): UseCase {
            return try {
                valueOf(value.uppercase())
            } catch (e: IllegalArgumentException) {
                entries.find { it.label == value } ?: OTHER
            }
        }

        fun fromLabel(label: String): UseCase {
            return entries.find { it.label == label } ?: OTHER
        }
    }
}
