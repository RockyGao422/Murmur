package com.murmur.app.domain.calculator

import com.murmur.app.domain.model.*

/**
 * Calculates estimated time saved, extra cost, and net gain for a ledger entry.
 * qualityScore (1-4) and moodWeight (0/2/6/8/10) are used for fatigue, not direct time multipliers.
 */
object EntryCalculator {

    /**
     * Calculate from a draft ledger entry.
     * Uses quality and mood for fatigue scoring; time calculations use explicit minute estimates.
     */
    fun calculate(draft: LedgerEntryDraft): CalculatedEntry {
        val activeSeconds = draft.activeSeconds

        // Quality ratio: 1→0.2, 2→0.4, 3→0.7, 4→1.0 (used as rough efficiency multiplier)
        val qualityRatio = (draft.quality.qualityScore.coerceIn(1, 4)).toFloat() / 4.0f

        // Mood impact: 0→1.0, 2→0.85, 6→0.65, 8→0.55, 10→0.4 (higher moodWeight → worse efficiency)
        val moodEfficiency = (1.0f - draft.mood.moodWeight / 20.0f).coerceIn(0.3f, 1.0f)

        // Estimated time saved: active time weighted by quality efficiency
        val timeSavedSeconds = (activeSeconds.toFloat() * qualityRatio * moodEfficiency).toLong()

        // Extra cost: penalty from low quality — higher qualityPenalty means more wasted time
        val qualityPenalty = (activeSeconds.toFloat() * draft.quality.qualityPenalty / 14.0f).toLong()
        val moodPenalty = (activeSeconds.toFloat() * draft.mood.moodWeight / 20.0f).toLong()
        val extraCostSeconds = qualityPenalty + moodPenalty

        val netGainSeconds = timeSavedSeconds - extraCostSeconds
        val hasRework = draft.quality != OutputQuality.DIRECT_USE

        return CalculatedEntry(
            timeSavedSeconds = timeSavedSeconds,
            extraCostSeconds = extraCostSeconds,
            netGainSeconds = netGainSeconds,
            hasRework = hasRework
        )
    }

    fun calculate(activeSeconds: Long, quality: OutputQuality, mood: UserMood): CalculatedEntry {
        return calculate(LedgerEntryDraft(activeSeconds = activeSeconds, quality = quality, mood = mood))
    }
}
