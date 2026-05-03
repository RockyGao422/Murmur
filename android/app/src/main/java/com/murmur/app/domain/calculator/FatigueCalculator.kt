package com.murmur.app.domain.calculator

import com.murmur.app.domain.model.DailySummary
import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.LedgerEntry
import com.murmur.app.domain.model.OutputQuality

/**
 * Calculates a fatigue score (0-100) based on AI usage patterns.
 * Higher scores indicate more AI fatigue / over-reliance.
 *
 * Components:
 * - Session count (max 40): each session adds 5 points
 * - Duration (max 25): each 5 minutes adds 1 point
 * - Rework (max 20): each entry with rework adds 10 points
 * - Quality (max 15): (1 - avg quality) * 20
 * Total capped at 100
 */
object FatigueCalculator {

    private const val MAX_SESSION_COMPONENT = 40
    private const val MAX_DURATION_COMPONENT = 25
    private const val MAX_REWORK_COMPONENT = 20
    private const val MAX_QUALITY_COMPONENT = 15
    private const val MAX_TOTAL = 100

    private const val POINTS_PER_SESSION = 5
    private const val SECONDS_PER_POINT = 300L // 5 minutes = 1 point

    fun calculate(
        sessions: List<DetectedSession>,
        entries: List<LedgerEntry>,
        dailySummary: DailySummary? = null
    ): Int {
        // 1. Session count component
        val sessionCount = sessions.size
        val sessionComponent = minOf(sessionCount * POINTS_PER_SESSION, MAX_SESSION_COMPONENT)

        // 2. Duration component
        val totalSeconds = dailySummary?.totalActiveSeconds
            ?: sessions.sumOf { it.activeSeconds }
        val totalMinutes = totalSeconds / 60
        val durationComponent = minOf((totalMinutes / 5).toInt(), MAX_DURATION_COMPONENT)

        // 3. Rework component (only if we have entries)
        val reworkComponent = if (entries.isNotEmpty()) {
            val reworkCount = entries.count { it.hasRework }
            minOf(reworkCount * 10, MAX_REWORK_COMPONENT)
        } else {
            0
        }

        // 4. Quality component (only if we have entries)
        val qualityComponent = if (entries.isNotEmpty()) {
            val avgQuality = entries.map { OutputQuality.qualityScores[it.quality] ?: 0.7f }.average().toFloat()
            minOf(((1.0f - avgQuality) * 20).toInt(), MAX_QUALITY_COMPONENT)
        } else {
            0
        }

        val total = sessionComponent + durationComponent + reworkComponent + qualityComponent
        return minOf(total, MAX_TOTAL)
    }
}
