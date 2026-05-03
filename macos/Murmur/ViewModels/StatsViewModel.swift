import Foundation
import Combine

@MainActor
class StatsViewModel: ObservableObject {
    private let storageManager: StorageManager

    @Published var dailyStats: [DailySummary] = []
    @Published var toolDistribution: [(toolName: String, count: Int)] = []
    @Published var platformDistribution: [(platform: String, count: Int)] = []
    @Published var qualityDistribution: [(quality: String, count: Int)] = []
    @Published var moodDistribution: [(mood: String, count: Int)] = []
    @Published var dailyActiveMinutesTrend: [(date: String, minutes: Int)] = []
    @Published var dailySessionCountTrend: [(date: String, count: Int)] = []
    @Published var isLoading: Bool = false
    @Published var selectedDays: Int = 30

    init(storageManager: StorageManager) {
        self.storageManager = storageManager
    }

    func loadStats(days: Int = 30) {
        isLoading = true
        selectedDays = days

        let sessions = storageManager.loadSessions()
        let entries = storageManager.loadEntries()

        let calendar = Calendar.current
        let today = Date()
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"

        var statsByDate: [String: DailySummary] = [:]

        for dayOffset in 0..<days {
            guard let date = calendar.date(byAdding: .day, value: -dayOffset, to: today) else { continue }
            let dateStr = dateFormatter.string(from: date)

            let daySessions = sessions.filter { $0.localDate == dateStr }
            let dayEntries = entries.filter { $0.localDate == dateStr }

            let totalActive = daySessions.reduce(0) { $0 + $1.activeSeconds }
            let toolIds = Set(daySessions.compactMap { $0.toolId })
            var switchCount = 0
            let sortedByIds = daySessions.sorted { $0.startedAt < $1.startedAt }.compactMap { $0.toolId }
            if sortedByIds.count > 1 {
                for i in 1..<sortedByIds.count {
                    if sortedByIds[i] != sortedByIds[i-1] { switchCount += 1 }
                }
            }

            let fatigueResult = FatigueCalculator.calculate(sessions: sessions, entries: entries, forDate: dateStr)

            let summary = DailySummary(
                id: dateStr,
                localDate: dateStr,
                detectedSessionCount: daySessions.count,
                pendingSessionCount: daySessions.filter { $0.status == .pending }.count,
                completedSessionCount: daySessions.filter { $0.status == .completed }.count,
                ignoredSessionCount: daySessions.filter { $0.status == .ignored }.count,
                suspectedSessionCount: daySessions.filter { $0.status == .suspected }.count,
                detectedActiveSeconds: totalActive,
                distinctToolCount: toolIds.count,
                toolSwitchCount: switchCount,
                nightSessionCount: daySessions.filter { $0.isNight }.count,
                totalEntries: dayEntries.count,
                totalSavedMinutes: dayEntries.reduce(0) { $0 + $1.estimatedSavedMinutes },
                totalExtraCostMinutes: dayEntries.reduce(0) { $0 + $1.totalExtraCostMinutes },
                netGainMinutes: dayEntries.reduce(0) { $0 + $1.netGainMinutes },
                totalReworkMinutes: dayEntries.reduce(0) { $0 + $1.reworkMinutes },
                reworkRate: dayEntries.isEmpty ? 0 : Double(dayEntries.filter { $0.hasRework }.count) / Double(dayEntries.count),
                fatigueScore: fatigueResult.fatigueScore,
                updatedAt: Date()
            )

            statsByDate[dateStr] = summary
        }

        dailyStats = statsByDate.values.sorted { $0.localDate > $1.localDate }

        // Tool distribution
        let toolCounts = Dictionary(grouping: sessions, by: { $0.toolName ?? "未知" })
            .mapValues { $0.count }
        toolDistribution = toolCounts
            .map { ($0.key, $0.value) }
            .sorted { $0.1 > $1.1 }

        // Platform distribution
        let platformCounts = Dictionary(grouping: sessions, by: { $0.sourcePlatform.displayName })
            .mapValues { $0.count }
        platformDistribution = platformCounts
            .map { ($0.key, $0.value) }
            .sorted { $0.1 > $1.1 }

        // Quality distribution
        let qualityCounts = Dictionary(grouping: entries, by: { $0.quality.displayName })
            .mapValues { $0.count }
        qualityDistribution = qualityCounts
            .map { ($0.key, $0.value) }
            .sorted { $0.1 > $1.1 }

        // Mood distribution
        let moodCounts = Dictionary(grouping: entries, by: { $0.mood.displayName })
            .mapValues { $0.count }
        moodDistribution = moodCounts
            .map { ($0.key, $0.value) }
            .sorted { $0.1 > $1.1 }

        // Trends
        dailyActiveMinutesTrend = dailyStats.prefix(days).map {
            (date: $0.localDate, minutes: $0.detectedActiveMinutes)
        }.reversed()

        dailySessionCountTrend = dailyStats.prefix(days).map {
            (date: $0.localDate, count: $0.detectedSessionCount)
        }.reversed()

        isLoading = false
    }

    // MARK: - Computed

    var totalDetectedSessions: Int {
        dailyStats.reduce(0) { $0 + $1.detectedSessionCount }
    }

    var totalDetectedMinutes: Int {
        dailyStats.reduce(0) { $0 + $1.detectedActiveMinutes }
    }

    var totalNetGain: Int {
        dailyStats.reduce(0) { $0 + $1.netGainMinutes }
    }

    var averageFatigueScore: Double {
        guard !dailyStats.isEmpty else { return 0 }
        return Double(dailyStats.reduce(0) { $0 + $1.fatigueScore }) / Double(dailyStats.count)
    }

    var maxActiveMinutes: Int {
        dailyActiveMinutesTrend.map { $0.minutes }.max() ?? 1
    }

    var maxSessionCount: Int {
        dailySessionCountTrend.map { $0.count }.max() ?? 1
    }
}
