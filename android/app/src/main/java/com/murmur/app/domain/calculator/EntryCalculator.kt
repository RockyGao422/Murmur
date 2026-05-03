package com.murmur.app.domain.calculator

import com.murmur.app.domain.model.*

/**
 * Calculates the estimated time saved, extra cost, and net gain for a ledger entry.
 * Mirrors the calculation logic from other Murmur platforms.
 */
object EntryCalculator {

    /**
     * Calculate estimated values from a draft ledger entry.
     */
    fun calculate(draft: LedgerEntryDraft): CalculatedEntry {
        val qualityScore = OutputQuality.qualityScores[draft.quality] ?: 0.7f
        val moodWeight = UserMood.moodWeights[draft.mood] ?: 1.0f

        val activeSeconds = draft.activeSeconds.toFloat()

        // Time saved: if output quality is good and mood is positive, we saved time
        // Rough estimate: AI output that works directly saves ~80% of manual time
        val timeSavedSeconds = (activeSeconds * qualityScore * moodWeight).toLong()

        // Extra cost: when quality is poor or mood is negative, extra time is needed
        // for rework, editing, or frustration
        val qualityPenalty = (activeSeconds * (1.0f - qualityScore)).toLong()
        val moodPenalty = (activeSeconds * maxOf(0.0f, 1.0f - moodWeight)).toLong()
        val extraCostSeconds = qualityPenalty + moodPenalty

        // Net gain
        val netGainSeconds = timeSavedSeconds - extraCostSeconds

        // Has rework if quality required any edits
        val hasRework = draft.quality != OutputQuality.USED_DIRECTLY

        return CalculatedEntry(
            timeSavedSeconds = timeSavedSeconds,
            extraCostSeconds = extraCostSeconds,
            netGainSeconds = netGainSeconds,
            hasRework = hasRework
        )
    }

    /**
     * Calculate for an existing ledger entry (no draft needed).
     */
    fun calculate(
        activeSeconds: Long,
        quality: OutputQuality,
        mood: UserMood
    ): CalculatedEntry {
        val draft = LedgerEntryDraft(
            activeSeconds = activeSeconds,
            quality = quality,
            mood = mood
        )
        return calculate(draft)
    }
}
