import Foundation

struct WeeklyReviewEngine {

    // MARK: - WeeklyReview Model

    struct WeeklyReview: Codable, Identifiable {
        var id: String { weekStart }
        let weekStart: String
        let weekEnd: String
        let detectionSummary: DetectionSummary
        let ledgerSummary: LedgerSummary
        let insights: [Insight]
        let recommendations: [String]
        let generatedAt: Date
    }

    struct DetectionSummary: Codable {
        let totalDetectedSessions: Int
        let totalDetectedActiveMinutes: Int
        let totalPendingSessions: Int
        let totalCompletedEntries: Int
        let completionRate: Double
        let distinctToolsUsed: Int
        let nightSessionCount: Int
    }

    struct LedgerSummary: Codable {
        let totalEstimatedSavedMinutes: Int
        let totalExtraCostMinutes: Int
        let netGainMinutes: Int
        let totalReworkMinutes: Int
        let reworkRate: Double
        let avgQualityScore: Double
    }

    struct Insight: Codable, Identifiable {
        var id: String { "\(type)_\(toolId ?? useCaseId ?? UUID().uuidString)" }
        let type: String
        let title: String
        let toolId: String?
        let toolName: String?
        let sessionCount: Int?
        let useCaseId: String?
        let useCaseName: String?
        let entryCount: Int?
        let avgNetGain: Double?
        let avgQuality: Double?
        let reworkRate: Double?
        let count: Int?
        let message: String
    }

    // MARK: - Generate Review

    static func generate(
        sessions: [DetectedSession],
        entries: [LedgerEntry],
        weekStart: String,
        weekEnd: String
    ) -> WeeklyReview {
        // Filter to date range
        let weekSessions = sessions.filter { $0.localDate >= weekStart && $0.localDate <= weekEnd }
        let weekEntries = entries.filter { $0.localDate >= weekStart && $0.localDate <= weekEnd }

        // Detection Summary
        let totalDetected = weekSessions.count
        let totalActiveSeconds = weekSessions.reduce(0) { $0 + $1.activeSeconds }
        let totalActiveMinutes = totalActiveSeconds / 60
        let pendingCount = weekSessions.filter { $0.status == .pending }.count
        let completedEntries = weekEntries.count

        let total = Double(pendingCount + completedEntries + weekSessions.filter { $0.status == .ignored }.count)
        let completionRate = total > 0 ? Double(completedEntries) / Double(max(1, weekSessions.count)) : 0

        let toolIds = Set(weekSessions.compactMap { $0.toolId })
        let nightCount = weekSessions.filter { $0.isNight }.count

        let detectionSummary = DetectionSummary(
            totalDetectedSessions: totalDetected,
            totalDetectedActiveMinutes: totalActiveMinutes,
            totalPendingSessions: pendingCount,
            totalCompletedEntries: completedEntries,
            completionRate: completionRate,
            distinctToolsUsed: toolIds.count,
            nightSessionCount: nightCount
        )

        // Ledger Summary
        let totalSaved = weekEntries.reduce(0) { $0 + $1.estimatedSavedMinutes }
        let totalExtraCost = weekEntries.reduce(0) { $0 + $1.totalExtraCostMinutes }
        let netGain = totalSaved - totalExtraCost
        let totalRework = weekEntries.reduce(0) { $0 + $1.reworkMinutes }
        let reworkRate = weekEntries.count > 0 ? Double(weekEntries.filter { $0.hasRework }.count) / Double(weekEntries.count) : 0
        let avgQuality = weekEntries.isEmpty ? 0 : Double(weekEntries.reduce(0) { $0 + $1.qualityScore }) / Double(weekEntries.count)

        let ledgerSummary = LedgerSummary(
            totalEstimatedSavedMinutes: totalSaved,
            totalExtraCostMinutes: totalExtraCost,
            netGainMinutes: netGain,
            totalReworkMinutes: totalRework,
            reworkRate: reworkRate,
            avgQualityScore: avgQuality
        )

        // Generate Insights
        var insights: [Insight] = []

        // 1. High frequency tool
        let toolFrequency = Dictionary(grouping: weekSessions, by: { $0.toolId ?? "unknown" })
            .mapValues { $0.count }
            .sorted { $0.value > $1.value }

        if let topTool = toolFrequency.first,
           let topToolSession = weekSessions.first(where: { $0.toolId == topTool.key }) {
            insights.append(Insight(
                type: "high_frequency_tool",
                title: "高频工具",
                toolId: topTool.key,
                toolName: topToolSession.toolName ?? topTool.key,
                sessionCount: topTool.value,
                useCaseId: nil,
                useCaseName: nil,
                entryCount: nil,
                avgNetGain: nil,
                avgQuality: nil,
                reworkRate: nil,
                count: nil,
                message: "\(topToolSession.toolName ?? topTool.key) 是本周使用最多的 AI 工具，共检测到 \(topTool.value) 次会话。"
            ))
        }

        // 2. High switch days
        if distinctTools(weekSessions) > 3 {
            insights.append(Insight(
                type: "high_switch",
                title: "高切换",
                toolId: nil,
                toolName: nil,
                sessionCount: nil,
                useCaseId: nil,
                useCaseName: nil,
                entryCount: nil,
                avgNetGain: nil,
                avgQuality: nil,
                reworkRate: nil,
                count: nil,
                message: "本周使用了 \(toolIds.count) 种不同 AI 工具，频繁切换可能影响工作流。"
            ))
        }

        // 3. Pending backlog
        if pendingCount > 0 {
            insights.append(Insight(
                type: "pending_backlog",
                title: "待补全堆积",
                toolId: nil,
                toolName: nil,
                sessionCount: nil,
                useCaseId: nil,
                useCaseName: nil,
                entryCount: nil,
                avgNetGain: nil,
                avgQuality: nil,
                reworkRate: nil,
                count: pendingCount,
                message: "还有 \(pendingCount) 条会话待补全，补全后才能计算真实净收益。"
            ))
        }

        // 4. Best use case
        let useCaseGroups = Dictionary(grouping: weekEntries, by: { $0.useCaseId })
        let useCaseStats = useCaseGroups.map { (useCaseId, entries) -> (String, String, Int, Double, Double) in
            let name = entries.first?.useCaseName ?? useCaseId
            let avgGain = Double(entries.reduce(0) { $0 + $1.netGainMinutes }) / Double(entries.count)
            let avgQ = Double(entries.reduce(0) { $0 + $1.qualityScore }) / Double(entries.count)
            return (useCaseId, name, entries.count, avgGain, avgQ)
        }.sorted { $0.3 > $1.3 }

        if let best = useCaseStats.first, best.3 > 0 {
            insights.append(Insight(
                type: "best_use_case",
                title: "最省力场景",
                toolId: nil,
                toolName: nil,
                sessionCount: nil,
                useCaseId: best.0,
                useCaseName: best.1,
                entryCount: best.2,
                avgNetGain: best.3,
                avgQuality: best.4,
                reworkRate: nil,
                count: nil,
                message: "\(best.1)场景平均净收益最高（+\(Int(best.3))分钟），值得继续使用 AI。"
            ))
        }

        // 5. Worst use case
        let worstByRework = useCaseStats
            .filter { $0.2 >= 2 }
            .sorted { $0.3 < $1.3 }

        if let worst = worstByRework.first, worst.3 < 0 {
            let worstReworkRate = useCaseGroups[worst.0].map { entries in
                Double(entries.filter { $0.hasRework }.count) / Double(max(1, entries.count))
            } ?? 0
            insights.append(Insight(
                type: "worst_use_case",
                title: "最亏时间场景",
                toolId: nil,
                toolName: nil,
                sessionCount: nil,
                useCaseId: worst.0,
                useCaseName: worst.1,
                entryCount: worst.2,
                avgNetGain: worst.3,
                avgQuality: worst.4,
                reworkRate: worstReworkRate,
                count: nil,
                message: "\(worst.1)返工率高，建议减少 AI 依赖或调整使用方式。"
            ))
        }

        // Generate recommendations
        var recommendations: [String] = []

        if let best = useCaseStats.first, best.3 > 10 {
            recommendations.append("继续在\(best.1)场景使用 AI，效率收益明显")
        }

        if reworkRate > 0.3 {
            recommendations.append("返工率超过 30%，建议更精确的 prompt 或分步骤输出")
        }

        if nightCount >= 3 {
            recommendations.append("减少深夜使用 AI，避免影响睡眠质量")
        }

        if pendingCount > 3 {
            recommendations.append("补全 \(pendingCount) 条待补全会话以获取更完整的周报")
        }

        if completionRate < 0.5 {
            recommendations.append("本周补全率较低，建议每天花2分钟完成补全")
        }

        if recommendations.isEmpty {
            recommendations.append("本周使用情况良好，继续保持！")
        }

        return WeeklyReview(
            weekStart: weekStart,
            weekEnd: weekEnd,
            detectionSummary: detectionSummary,
            ledgerSummary: ledgerSummary,
            insights: insights,
            recommendations: recommendations,
            generatedAt: Date()
        )
    }

    // MARK: - Helpers

    private static func distinctTools(_ sessions: [DetectedSession]) -> Int {
        return Set(sessions.compactMap { $0.toolId }).count
    }
}
