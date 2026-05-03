import Foundation
import Combine

@MainActor
class CompletionViewModel: ObservableObject {
    private let storageManager: StorageManager

    // Session being completed
    let session: DetectedSession

    // Auto-filled fields
    @Published var toolName: String = ""
    @Published var platformName: String = ""
    @Published var timeRange: String = ""
    @Published var duration: String = ""
    @Published var localDate: String = ""

    // User input fields
    @Published var useCaseId: String = "other"
    @Published var useCaseName: String = "其他"
    @Published var estimatedSavedMinutes: Int = 15
    @Published var promptMinutes: Int = 5
    @Published var reviewMinutes: Int = 5
    @Published var editMinutes: Int = 0
    @Published var debugMinutes: Int = 0
    @Published var reworkMinutes: Int = 0
    @Published var quality: OutputQuality = .minorEdit
    @Published var mood: UserMood = .neutral
    @Published var note: String = ""

    @Published var validationMessage: String?
    @Published var isSaving: Bool = false
    @Published var isSaved: Bool = false

    var onSaved: ((LedgerEntry) -> Void)?
    var onCancel: (() -> Void)?

    private let useCaseOptions: [(id: String, name: String)] = UseCaseCategory.allCases.map { ($0.rawValue, $0.displayName) }

    init(session: DetectedSession, storageManager: StorageManager) {
        self.session = session
        self.storageManager = storageManager
        autoFillFields()
    }

    private func autoFillFields() {
        toolName = session.toolName ?? "未知工具"
        platformName = session.sourcePlatform.displayName
        timeRange = session.timeRangeFormatted
        duration = session.durationFormatted
        localDate = session.localDate

        // Suggested defaults
        let defaults = EntryCalculator.suggestedDefaults(session: session)
        estimatedSavedMinutes = defaults.estimatedSaved
        promptMinutes = defaults.promptMinutes
        reviewMinutes = defaults.reviewMinutes
        editMinutes = defaults.editMinutes
        debugMinutes = defaults.debugMinutes
        reworkMinutes = defaults.reworkMinutes
        quality = defaults.quality
    }

    func save() {
        let validation = EntryCalculator.validate(
            estimatedSavedMinutes: estimatedSavedMinutes,
            promptMinutes: promptMinutes,
            reviewMinutes: reviewMinutes,
            editMinutes: editMinutes,
            debugMinutes: debugMinutes,
            reworkMinutes: reworkMinutes
        )

        guard validation.isValid else {
            validationMessage = validation.message
            return
        }

        validationMessage = nil
        isSaving = true

        let entry = EntryCalculator.calculate(
            session: session,
            useCaseId: useCaseId,
            useCaseName: useCaseName,
            estimatedSavedMinutes: estimatedSavedMinutes,
            promptMinutes: promptMinutes,
            reviewMinutes: reviewMinutes,
            editMinutes: editMinutes,
            debugMinutes: debugMinutes,
            reworkMinutes: reworkMinutes,
            quality: quality,
            mood: mood,
            note: note.isEmpty ? nil : note
        )

        // Save entry
        var entries = storageManager.loadEntries()
        entries.append(entry)
        storageManager.saveEntries(entries)

        // Update session status to completed
        var sessions = storageManager.loadSessions()
        if let index = sessions.firstIndex(where: { $0.id == session.id }) {
            var updatedSession = sessions[index]
            updatedSession.status = .completed
            updatedSession.updatedAt = Date()
            sessions[index] = updatedSession
            storageManager.saveSessions(sessions)
        }

        isSaving = false
        isSaved = true
        onSaved?(entry)
    }

    func cancel() {
        onCancel?()
    }

    // MARK: - Computed Properties

    var useCases: [(id: String, name: String)] {
        return useCaseOptions
    }

    var qualityOptions: [OutputQuality] {
        return OutputQuality.allCases
    }

    var moodOptions: [UserMood] {
        return UserMood.allCases
    }

    var extraCostTotal: Int {
        return promptMinutes + reviewMinutes + editMinutes + debugMinutes + reworkMinutes
    }

    var netGainPreview: Int {
        return estimatedSavedMinutes - extraCostTotal
    }

    var netGainPreviewFormatted: String {
        let gain = netGainPreview
        if gain >= 0 {
            return "+\(gain)分钟"
        } else {
            return "\(gain)分钟"
        }
    }

    var isNetGainPositive: Bool {
        return netGainPreview > 0
    }

    func setUseCase(_ id: String, name: String) {
        useCaseId = id
        useCaseName = name
    }
}
