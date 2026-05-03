import Foundation
import Combine

@MainActor
class InboxViewModel: ObservableObject {
    private let storageManager: StorageManager

    @Published var pendingSessions: [DetectedSession] = []
    @Published var suspectedSessions: [DetectedSession] = []
    @Published var mergeSuggestions: [(session1: DetectedSession, session2: DetectedSession, reason: String)] = []
    @Published var ignoredCount: Int = 0
    @Published var isLoading: Bool = false

    private var allSessions: [DetectedSession] = []

    init(storageManager: StorageManager) {
        self.storageManager = storageManager
    }

    func loadInbox() {
        isLoading = true

        allSessions = storageManager.loadSessions()
        pendingSessions = allSessions
            .filter { $0.status == .pending }
            .sorted { $0.startedAt > $1.startedAt }

        suspectedSessions = allSessions
            .filter { $0.status == .suspected }
            .sorted { $0.startedAt > $1.startedAt }

        ignoredCount = allSessions.filter { $0.status == .ignored }.count

        // Generate merge suggestions (same tool, within 3 min gap)
        generateMergeSuggestions()

        isLoading = false
    }

    // MARK: - Actions

    func completeSession(_ session: DetectedSession) {
        // This will be handled by CompletionViewModel
    }

    func ignoreSession(_ session: DetectedSession) {
        guard let index = allSessions.firstIndex(where: { $0.id == session.id }) else { return }
        var updated = session
        updated.status = .ignored
        updated.updatedAt = Date()
        allSessions[index] = updated
        storageManager.saveSessions(allSessions)
        loadInbox()
    }

    func mergeSessions(source: DetectedSession, target: DetectedSession) {
        guard let sourceIndex = allSessions.firstIndex(where: { $0.id == source.id }),
              let targetIndex = allSessions.firstIndex(where: { $0.id == target.id }) else { return }

        var merged = allSessions[targetIndex]
        merged.endedAt = max(source.endedAt, target.endedAt)
        merged.activeSeconds = Int(merged.endedAt.timeIntervalSince(merged.startedAt))
        merged.idleSeconds += source.idleSeconds
        merged.updatedAt = Date()

        var updatedSource = allSessions[sourceIndex]
        updatedSource.status = .merged
        updatedSource.mergedIntoSessionId = target.id
        updatedSource.updatedAt = Date()

        allSessions[targetIndex] = merged
        allSessions[sourceIndex] = updatedSource
        storageManager.saveSessions(allSessions)
        loadInbox()
    }

    func remapTool(session: DetectedSession, toToolId: String, toolName: String) {
        guard let index = allSessions.firstIndex(where: { $0.id == session.id }) else { return }
        var updated = session
        updated.toolId = toToolId
        updated.toolName = toolName
        updated.updatedAt = Date()
        allSessions[index] = updated
        storageManager.saveSessions(allSessions)
        loadInbox()
    }

    func batchIgnore(_ sessions: [DetectedSession]) {
        let ids = Set(sessions.map { $0.id })
        for (index, session) in allSessions.enumerated() {
            if ids.contains(session.id) {
                var updated = session
                updated.status = .ignored
                updated.updatedAt = Date()
                allSessions[index] = updated
            }
        }
        storageManager.saveSessions(allSessions)
        loadInbox()
    }

    // MARK: - Private

    private func generateMergeSuggestions() {
        mergeSuggestions.removeAll()

        let sorted = pendingSessions.sorted { $0.startedAt < $1.startedAt }
        guard sorted.count > 1 else { return }

        for i in 0..<(sorted.count - 1) {
            for j in (i + 1)..<sorted.count {
                let a = sorted[i]
                let b = sorted[j]
                let gap = b.startedAt.timeIntervalSince(a.endedAt)

                if gap >= 0 && gap <= 180 && a.toolId == b.toolId {
                    let reason = "相同工具「\(a.toolName ?? "")」，间隔 \(Int(gap))秒"
                    mergeSuggestions.append((a, b, reason))
                }
            }
        }
    }

    // MARK: - Computed

    var pendingGroupedByDate: [(date: String, sessions: [DetectedSession])] {
        let grouped = Dictionary(grouping: pendingSessions) { $0.localDate }
        return grouped
            .map { ($0.key, $0.value.sorted { $0.startedAt > $1.startedAt }) }
            .sorted { $0.0 > $1.0 }
    }

    var totalPending: Int {
        return pendingSessions.count
    }

    var totalSuspected: Int {
        return suspectedSessions.count
    }
}
