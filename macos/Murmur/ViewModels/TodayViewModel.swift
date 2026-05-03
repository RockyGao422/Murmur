import Foundation
import Combine

@MainActor
class TodayViewModel: ObservableObject {
    private let storageManager: StorageManager
    private let detectionManager: DetectionManager
    private var cancellables = Set<AnyCancellable>()

    @Published var detectionStatus: DetectionStatus = .disabled
    @Published var detectedSessionCount: Int = 0
    @Published var detectedActiveDuration: String = "0分钟"
    @Published var pendingSessionCount: Int = 0
    @Published var completionRate: Double = 0
    @Published var netGainMinutes: Int = 0
    @Published var fatigueScore: Int = 0
    @Published var fatigueLevelDescription: String = "无数据"
    @Published var recentSessions: [DetectedSession] = []
    @Published var recentEntries: [LedgerEntry] = []
    @Published var isLoading: Bool = false

    private var allSessions: [DetectedSession] = []
    private var allEntries: [LedgerEntry] = []

    init(storageManager: StorageManager, detectionManager: DetectionManager) {
        self.storageManager = storageManager
        self.detectionManager = detectionManager

        // Observe detection status
        detectionManager.$detectionStatus
            .receive(on: DispatchQueue.main)
            .assign(to: \.detectionStatus, on: self)
            .store(in: &cancellables)
    }

    func loadTodayData() {
        isLoading = true

        let today = localDateString(for: Date())
        allSessions = storageManager.loadSessions()
        allEntries = storageManager.loadEntries()

        let todaySessions = allSessions.filter { $0.localDate == today }
        let todayEntries = allEntries.filter { $0.localDate == today }

        // Session stats
        detectedSessionCount = todaySessions.count
        let totalActive = todaySessions.reduce(0) { $0 + $1.activeSeconds }
        detectedActiveDuration = formatDuration(seconds: totalActive)

        pendingSessionCount = todaySessions.filter { $0.status == .pending }.count

        let total = todaySessions.count
        let completed = todaySessions.filter { $0.status == .completed }.count
        completionRate = total > 0 ? Double(completed) / Double(total) : 0

        // Net gain from entries
        netGainMinutes = todayEntries.reduce(0) { $0 + $1.netGainMinutes }

        // Fatigue calculation
        let fatigueResult = FatigueCalculator.calculate(
            sessions: allSessions,
            entries: allEntries,
            forDate: today
        )
        fatigueScore = fatigueResult.fatigueScore
        let level = FatigueCalculator.fatigueLevel(fatigueScore)
        fatigueLevelDescription = "\(level.level) (\(fatigueScore)分)"

        // Recent sessions (last 10 for today)
        recentSessions = Array(todaySessions.sorted { $0.startedAt > $1.startedAt }.prefix(10))

        // Recent entries (last 10 for today)
        recentEntries = Array(todayEntries.sorted { $0.createdAt > $1.createdAt }.prefix(10))

        isLoading = false
    }

    // MARK: - Helpers

    private func localDateString(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        return formatter.string(from: date)
    }

    private func formatDuration(seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        if hours > 0 {
            return "\(hours)时\(minutes)分"
        }
        return "\(minutes)分钟"
    }

    var completionRatePercent: String {
        return String(format: "%.0f%%", completionRate * 100)
    }

    var netGainFormatted: String {
        if netGainMinutes >= 0 {
            return "+\(netGainMinutes)分钟"
        } else {
            return "\(netGainMinutes)分钟"
        }
    }

    var detectionStatusColor: String {
        switch detectionStatus {
        case .running: return "green"
        case .paused: return "yellow"
        case .disabled: return "red"
        }
    }

    var detectionStatusText: String {
        return detectionStatus.displayName
    }
}
