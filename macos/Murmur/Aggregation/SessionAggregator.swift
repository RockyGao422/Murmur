import Foundation

/// Cross-platform session aggregation logic.
/// Shared algorithm: merge adjacent, interval union, gross vs deduped active_seconds,
/// tool/source distribution, completion rate.
struct SessionAggregator {

    // MARK: - Filtering

    static func isIncluded(_ session: DetectedSession) -> Bool {
        switch session.status {
        case .pending, .completed, .suspected: return true
        case .ignored, .merged: return false
        }
    }

    static func normalizeSessions(_ sessions: [DetectedSession]) -> [DetectedSession] {
        return sessions.filter(isIncluded)
    }

    // MARK: - Adjacent Merge

    /// Merge sessions of same tool within window (default 180s).
    /// Same device, same source_platform, same source_kind, same tool_id.
    static func mergeAdjacentSessions(_ sessions: [DetectedSession], windowSeconds: TimeInterval = 180) -> [DetectedSession] {
        let included = normalizeSessions(sessions)
        guard included.count > 1 else { return included }

        let sorted = included.sorted { $0.startedAt < $1.startedAt }
        var merged: [DetectedSession] = []
        var current = sorted[0]

        for i in 1..<sorted.count {
            let next = sorted[i]
            let sameTool = current.toolId == next.toolId
            let sameSource = current.sourcePlatform == next.sourcePlatform &&
                             current.sourceKind == next.sourceKind
            let gap = next.startedAt.timeIntervalSince(current.endedAt)

            if sameTool && sameSource && gap > 0 && gap <= windowSeconds {
                var updated = current
                updated.endedAt = max(current.endedAt, next.endedAt)
                updated.activeSeconds = current.activeSeconds + next.activeSeconds
                updated.promptCount = (current.promptCount ?? 0) + (next.promptCount ?? 0)
                updated.updatedAt = Date()
                current = updated
            } else {
                merged.append(current)
                current = next
            }
        }
        merged.append(current)
        return merged
    }

    // MARK: - Active Seconds

    /// Gross active seconds: simple sum of all included sessions.
    static func calculateGrossActiveSeconds(_ sessions: [DetectedSession]) -> Int {
        return normalizeSessions(sessions).reduce(0) { $0 + $1.activeSeconds }
    }

    /// Deduped active seconds: interval union of all session time ranges.
    static func calculateDedupedActiveSeconds(_ sessions: [DetectedSession]) -> Int {
        let included = normalizeSessions(sessions).filter { $0.activeSeconds >= 15 }
        guard !included.isEmpty else { return 0 }

        let intervals = included.map {
            (start: $0.startedAt.timeIntervalSince1970, end: $0.endedAt.timeIntervalSince1970)
        }.sorted { $0.start < $1.start }

        var merged: [(start: TimeInterval, end: TimeInterval)] = []
        var current = intervals[0]

        for i in 1..<intervals.count {
            if intervals[i].start > current.end {
                merged.append(current)
                current = intervals[i]
            } else {
                current.end = max(current.end, intervals[i].end)
            }
        }
        merged.append(current)

        return Int(merged.reduce(0) { $0 + ($1.end - $1.start) })
    }

    // MARK: - Distribution

    static func calculateToolDistribution(_ sessions: [DetectedSession]) -> [(toolName: String, seconds: Int)] {
        let included = normalizeSessions(sessions)
        var dist: [String: Int] = [:]
        for s in included {
            let name = s.toolName ?? s.toolId ?? "Unknown"
            dist[name, default: 0] += s.activeSeconds
        }
        return dist.map { ($0.key, $0.value) }.sorted { $0.1 > $1.1 }
    }

    static func calculateAppWebBreakdown(_ sessions: [DetectedSession]) -> (app: Int, web: Int) {
        let included = normalizeSessions(sessions)
        var app = 0, web = 0
        for s in included {
            if s.sourceKind == .web { web += s.activeSeconds }
            else { app += s.activeSeconds }
        }
        return (app, web)
    }

    // MARK: - Completion Rate

    static func calculateCompletionRate(sessions: [DetectedSession], entries: [LedgerEntry]) -> Double {
        let included = normalizeSessions(sessions)
        let pendingCount = included.filter { $0.status == .pending || $0.status == .suspected }.count
        let completedCount = included.filter { $0.status == .completed }.count
        let total = pendingCount + completedCount
        return total > 0 ? Double(completedCount) / Double(total) : 0
    }

    // MARK: - Daily Summary

    static func buildDailySummary(sessions: [DetectedSession], entries: [LedgerEntry], localDate: String) -> DailySummary {
        let dateSessions = sessions.filter { $0.localDate == localDate }
        let dateEntries = entries.filter { $0.localDate == localDate }
        let included = normalizeSessions(dateSessions)
        let (appSec, webSec) = calculateAppWebBreakdown(included)
        let promptTotal = included.reduce(0) { $0 + ($1.promptCount ?? 0) }

        let gross = calculateGrossActiveSeconds(included)
        return DailySummary(
            id: localDate,
            localDate: localDate,
            detectedSessionCount: included.count,
            pendingSessionCount: included.filter { $0.status == .pending }.count,
            completedSessionCount: included.filter { $0.status == .completed }.count,
            detectedActiveSeconds: gross,
            grossActiveSeconds: gross,
            dedupedActiveSeconds: calculateDedupedActiveSeconds(included),
            appActiveSeconds: appSec,
            webActiveSeconds: webSec,
            promptCount: promptTotal,
            completionRate: calculateCompletionRate(sessions: dateSessions, entries: dateEntries)
        )
    }
}
