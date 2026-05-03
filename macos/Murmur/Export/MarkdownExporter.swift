import Foundation

/// Generates Markdown weekly review reports for export.
final class MarkdownExporter {

    private let storageManager = StorageManager.shared

    struct WeeklyData {
        let weekStart: String
        let weekEnd: String
        let sessions: [DetectedSession]
        let entries: [LedgerEntry]
        let dailySummaries: [DailySummary]
        let weeklyReview: WeeklyReview
    }

    func exportMarkdown(for weekData: WeeklyData) -> String {
        var md = ""
        md += "# Murmur 周报\n\n"
        md += "**周期**: \(weekData.weekStart) ~ \(weekData.weekEnd)\n\n"
        md += "---\n\n"

        // Auto-Detection Overview
        md += detectionSection(sessions: weekData.sessions)

        // Completed Ledger Summary
        md += ledgerSection(entries: weekData.entries)

        // Pending Sessions
        md += pendingSection(sessions: weekData.sessions)

        // Best Use Cases
        md += bestUseCasesSection(entries: weekData.entries)

        // High-Friction Tools
        md += highFrictionSection(entries: weekData.entries, sessions: weekData.sessions)

        // Weekly Insights
        md += insightsSection(weeklyReview: weekData.weeklyReview)

        // Recommendations
        md += recommendationsSection(weeklyReview: weekData.weeklyReview)

        md += "\n---\n\n"
        md += "*由 Murmur 自动生成，数据仅保存在本地。*\n"

        return md
    }

    private func detectionSection(sessions: [DetectedSession]) -> String {
        let totalSessions = sessions.count
        let totalActiveMinutes = sessions.reduce(0) { $0 + $1.activeSeconds } / 60
        let uniqueTools = Set(sessions.map { $0.toolName }).count
        let nightCount = sessions.filter { $0.isNight }.count
        let completedCount = sessions.filter { $0.status == .completed }.count
        let pendingCount = sessions.filter { $0.status == .pending }.count
        let completionRate = totalSessions > 0 ? Int(Double(completedCount) / Double(totalSessions) * 100) : 0

        var md = "## 自动检测概览\n\n"
        md += "| 指标 | 数值 |\n"
        md += "|------|------|\n"
        md += "| 检测会话数 | \(totalSessions) |\n"
        md += "| AI 使用总时长 | \(totalActiveMinutes) 分钟 |\n"
        md += "| 使用的 AI 工具 | \(uniqueTools) 个 |\n"
        md += "| 夜间使用次数 | \(nightCount) |\n"
        md += "| 已补全 | \(completedCount) (\(completionRate)%) |\n"
        md += "| 待补全 | \(pendingCount) |\n\n"

        // Tool breakdown
        let toolGroups = Dictionary(grouping: sessions) { $0.toolName }
        let sortedTools = toolGroups.map { (tool: $0.key, count: $0.value.count, minutes: $0.value.reduce(0) { $0 + $1.activeSeconds } / 60) }
            .sorted { $0.count > $1.count }
        if !sortedTools.isEmpty {
            md += "### 工具使用分布\n\n"
            md += "| 工具 | 会话数 | 使用时长(分钟) |\n"
            md += "|------|--------|---------------|\n"
            for item in sortedTools.prefix(10) {
                md += "| \(item.tool) | \(item.count) | \(item.minutes) |\n"
            }
            md += "\n"
        }

        return md
    }

    private func ledgerSection(entries: [LedgerEntry]) -> String {
        guard !entries.isEmpty else {
            return "## 已补全收益\n\n*本周尚无已补全记录。*\n\n"
        }

        let totalSaved = entries.reduce(0) { $0 + $1.estimatedSavedMinutes }
        let totalCost = entries.reduce(0) { $0 + $1.totalExtraCostMinutes }
        let netGain = totalSaved - totalCost
        let avgQuality = entries.map(\.qualityScore).reduce(0, +) / entries.count
        let reworkRate = entries.filter(\.hasRework).count * 100 / max(entries.count, 1)

        var md = "## 已补全收益\n\n"
        md += "| 指标 | 数值 |\n"
        md += "|------|------|\n"
        md += "| 补全记录数 | \(entries.count) |\n"
        md += "| 估计节省时间 | \(totalSaved) 分钟 |\n"
        md += "| 额外成本 | \(totalCost) 分钟 |\n"
        md += "| 净收益 | \(netGain) 分钟 |\n"
        md += "| 平均质量 | \(qualityDescription(avgQuality)) |\n"
        md += "| 返工率 | \(reworkRate)% |\n\n"

        // Most productive entries
        let topEntries = entries.sorted { $0.netGainMinutes > $1.netGainMinutes }.prefix(3)
        if !topEntries.isEmpty {
            md += "### 最高收益记录\n\n"
            for entry in topEntries {
                md += "- **\(entry.toolName)** · \(entry.useCaseName): 净收益 \(entry.netGainMinutes) 分钟\n"
            }
            md += "\n"
        }

        return md
    }

    private func pendingSection(sessions: [DetectedSession]) -> String {
        let pending = sessions.filter { $0.status == .pending }
        guard !pending.isEmpty else { return "" }

        let pendingMinutes = pending.reduce(0) { $0 + $1.activeSeconds } / 60
        var md = "## 待补全会话\n\n"
        md += "还有 **\(pending.count)** 条会话待补全（共 \(pendingMinutes) 分钟），补全后可获得更完整的收益分析。\n\n"

        let groupedByTool = Dictionary(grouping: pending) { $0.toolName }
        for (tool, toolSessions) in groupedByTool.sorted(by: { $0.value.count > $1.value.count }) {
            md += "- \(tool): \(toolSessions.count) 条待补全\n"
        }
        md += "\n"
        return md
    }

    private func bestUseCasesSection(entries: [LedgerEntry]) -> String {
        let grouped = Dictionary(grouping: entries) { $0.useCaseName }
        let stats = grouped.compactMap { (useCase: String, items: [LedgerEntry]) -> (String, Int, Int, Int)? in
            guard items.count >= 3 else { return nil }
            let avgNet = items.reduce(0) { $0 + $1.netGainMinutes } / items.count
            let avgQuality = items.reduce(0) { $0 + $1.qualityScore } / items.count
            return (useCase, items.count, avgNet, avgQuality)
        }
        .filter { $0.2 > 0 && $0.3 >= 3 }
        .sorted { $0.2 > $1.2 }

        guard !stats.isEmpty else { return "" }

        var md = "## 最省力场景\n\n"
        md += "| 场景 | 记录数 | 平均净收益 | 平均质量 |\n"
        md += "|------|--------|-----------|----------|\n"
        for (useCase, count, avgNet, avgQuality) in stats {
            md += "| \(useCase) | \(count) | \(avgNet) 分钟 | \(qualityDescription(avgQuality)) |\n"
        }
        md += "\n"
        return md
    }

    private func highFrictionSection(entries: [LedgerEntry], sessions: [DetectedSession]) -> String {
        let grouped = Dictionary(grouping: entries) { $0.toolName }
        let friction = grouped.filter { (_, items) in
            items.count >= 3 && (items.reduce(0) { $0 + $1.netGainMinutes } / items.count) < 0
        }

        guard !friction.isEmpty else { return "" }

        var md = "## 高摩擦工具\n\n"
        md += "以下工具的平均净收益为负，建议评估使用方式：\n\n"
        for (tool, items) in friction.sorted(by: { ($0.value.reduce(0) { $0 + $1.netGainMinutes } / $0.value.count) < ($1.value.reduce(0) { $0 + $1.netGainMinutes } / $1.value.count) }) {
            let avgNet = items.reduce(0) { $0 + $1.netGainMinutes } / items.count
            let reworkRate = items.filter(\.hasRework).count * 100 / items.count
            md += "- **\(tool)**: 平均净收益 \(avgNet) 分钟，返工率 \(reworkRate)%\n"
        }
        md += "\n"
        return md
    }

    private func insightsSection(weeklyReview: WeeklyReview) -> String {
        guard !weeklyReview.insights.isEmpty else { return "" }
        var md = "## 周报洞察\n\n"
        for insight in weeklyReview.insights {
            md += "### \(insight.type)\n\n"
            md += "\(insight.message)\n\n"
        }
        return md
    }

    private func recommendationsSection(weeklyReview: WeeklyReview) -> String {
        guard !weeklyReview.recommendations.isEmpty else { return "" }
        var md = "## 下周建议\n\n"
        for (index, rec) in weeklyReview.recommendations.enumerated() {
            md += "\(index + 1). \(rec)\n"
        }
        md += "\n"
        return md
    }

    private func qualityDescription(_ score: Int) -> String {
        switch score {
        case 4: return "直接可用"
        case 3: return "需小改"
        case 2: return "需大改"
        default: return "不可用"
        }
    }
}

extension MarkdownExporter.WeeklyData {
    init(date: Date, storageManager: StorageManager) {
        let calendar = Calendar.current
        let weekStart = calendar.date(from: calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date))!
        let weekEnd = calendar.date(byAdding: .day, value: 6, to: weekStart)!
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        self.weekStart = formatter.string(from: weekStart)
        self.weekEnd = formatter.string(from: weekEnd)

        let allSessions = storageManager.loadSessions()
        let allEntries = storageManager.loadEntries()

        self.sessions = allSessions.filter {
            guard let startedAt = $0.startedAt else { return false }
            return startedAt >= weekStart && startedAt <= weekEnd
        }
        self.entries = allEntries.filter {
            $0.createdAt >= weekStart && $0.createdAt <= weekEnd
        }
        self.dailySummaries = storageManager.loadDailySummaries()
        self.weeklyReview = WeeklyReview(weekStart: weekStart, weekEnd: weekEnd)
    }
}
