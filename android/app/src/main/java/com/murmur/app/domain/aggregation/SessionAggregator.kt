package com.murmur.app.domain.aggregation

import com.murmur.app.domain.model.DetectedSession
import com.murmur.app.domain.model.LedgerEntry
import com.murmur.app.domain.model.SessionStatus
import com.murmur.app.domain.model.SourceKind

/**
 * Cross-platform session aggregation with shared algorithms.
 * mergeAdjacent, interval union, gross vs deduped active_seconds,
 * tool/source distribution, completion rate.
 */
object SessionAggregator {

    fun isIncluded(session: DetectedSession): Boolean {
        return when (session.status) {
            SessionStatus.PENDING, SessionStatus.COMPLETED, SessionStatus.SUSPECTED -> true
            else -> false
        }
    }

    fun normalizeSessions(sessions: List<DetectedSession>): List<DetectedSession> {
        return sessions.filter { isIncluded(it) }
    }

    // MARK: - Adjacent Merge

    /**
     * Merge sessions of same tool within window (default 180s).
     * Same device, same source_platform, same source_kind, same tool_id.
     */
    fun mergeAdjacentSessions(
        sessions: List<DetectedSession>,
        windowSeconds: Long = 180
    ): List<DetectedSession> {
        val included = normalizeSessions(sessions)
        if (included.size <= 1) return included.toList()

        val sorted = included.sortedBy { it.startedAt }
        val merged = mutableListOf<DetectedSession>()
        var current = sorted[0]

        for (i in 1 until sorted.size) {
            val next = sorted[i]
            val sameTool = current.toolId == next.toolId
            val sameSource = current.sourcePlatform == next.sourcePlatform &&
                    current.sourceKind == next.sourceKind
            val gap = (next.startedAt - current.endedAt) / 1000

            if (sameTool && sameSource && gap in 1..windowSeconds) {
                current = current.copy(
                    endedAt = maxOf(current.endedAt, next.endedAt),
                    activeSeconds = current.activeSeconds + next.activeSeconds,
                    promptCount = (current.promptCount ?: 0) + (next.promptCount ?: 0),
                    updatedAt = System.currentTimeMillis()
                )
            } else {
                merged.add(current)
                current = next
            }
        }
        merged.add(current)
        return merged
    }

    // MARK: - Active Seconds

    fun calculateGrossActiveSeconds(sessions: List<DetectedSession>): Long {
        return normalizeSessions(sessions).sumOf { it.activeSeconds }
    }

    /**
     * Deduped active seconds: interval union of all session time ranges.
     */
    fun calculateDedupedActiveSeconds(sessions: List<DetectedSession>): Long {
        val included = normalizeSessions(sessions).filter { it.activeSeconds >= 15 }
        if (included.isEmpty()) return 0

        val intervals = included.map {
            it.startedAt.toDouble() to it.endedAt.toDouble()
        }.sortedBy { it.first }

        val merged = mutableListOf<Pair<Double, Double>>()
        var current = intervals[0]

        for (i in 1 until intervals.size) {
            if (intervals[i].first > current.second) {
                merged.add(current)
                current = intervals[i]
            } else {
                current = current.copy(second = maxOf(current.second, intervals[i].second))
            }
        }
        merged.add(current)

        return merged.sumOf { (it.second - it.first).toLong() / 1000 }
    }

    // MARK: - Distribution

    fun calculateToolDistribution(sessions: List<DetectedSession>): Map<String, Long> {
        val included = normalizeSessions(sessions)
        val dist = mutableMapOf<String, Long>()
        for (s in included) {
            val name = s.toolName.ifEmpty { s.toolId }
            dist[name] = (dist[name] ?: 0) + s.activeSeconds
        }
        return dist.toList().sortedByDescending { it.second }.toMap()
    }

    fun calculateAppWebBreakdown(sessions: List<DetectedSession>): Pair<Long, Long> {
        val included = normalizeSessions(sessions)
        var app = 0L
        var web = 0L
        for (s in included) {
            if (s.sourceKind == SourceKind.WEB) web += s.activeSeconds
            else app += s.activeSeconds
        }
        return app to web
    }

    // MARK: - Completion Rate

    fun calculateCompletionRate(sessions: List<DetectedSession>, entries: List<LedgerEntry>): Double {
        val included = normalizeSessions(sessions)
        val pending = included.count { it.status == SessionStatus.PENDING || it.status == SessionStatus.SUSPECTED }
        val completed = included.count { it.status == SessionStatus.COMPLETED }
        val total = pending + completed
        return if (total > 0) completed.toDouble() / total else 0.0
    }
}
