import Foundation
import Combine
import AppKit

class DetectionManager: ObservableObject {
    private let toolMatcher = ToolMatcher()
    private let sessionizer = Sessionizer()
    private lazy var appDetector = AppDetector(
        toolMatcher: toolMatcher,
        sessionizer: sessionizer,
        windowTitleDetector: windowTitleDetector
    )
    private let windowTitleDetector = WindowTitleDetector()

    @Published var detectionStatus: DetectionStatus = .disabled
    @Published var detectedSessions: [DetectedSession] = []

    // Callbacks for integration with StorageManager
    var onNewSession: ((DetectedSession) -> Void)?
    var onStatusChanged: ((DetectionStatus) -> Void)?

    private var settings: AppSettings = AppSettings()
    private var pauseTimer: Timer?
    private var pauseEndDate: Date?

    init() {
        appDetector.onSessionDetected = { [weak self] session in
            self?.handleNewSession(session)
        }
    }

    // MARK: - Lifecycle

    func startDetection() {
        updateStatus(.running)
        appDetector.reset()
        loadToolCatalog()
    }

    func stopDetection() {
        // Flush current sessions before stopping
        let flushed = appDetector.forceFlushCurrentSession()
        for session in flushed {
            handleNewSession(session)
        }
        updateStatus(.disabled)
        pauseTimer?.invalidate()
        pauseTimer = nil
    }

    func pauseDetection(duration: TimeInterval? = nil) {
        if let duration = duration {
            // Pause for specific duration
            pauseEndDate = Date().addingTimeInterval(duration)
            updateStatus(.paused)

            pauseTimer?.invalidate()
            pauseTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in
                self?.resumeDetection()
            }
        } else {
            // Pause indefinitely
            pauseEndDate = nil
            updateStatus(.paused)
            pauseTimer?.invalidate()
            pauseTimer = nil
        }
    }

    func resumeDetection() {
        pauseEndDate = nil
        pauseTimer?.invalidate()
        pauseTimer = nil
        updateStatus(.running)
    }

    // MARK: - NSWorkspace Notification

    func handleAppActivation(_ notification: Notification) {
        guard detectionStatus == .running else { return }
        appDetector.handleAppActivation(notification)
    }

    // MARK: - Tool Catalog

    func updateToolCatalog(_ tools: [ToolCatalogItem]) {
        toolMatcher.updateCatalog(tools)
    }

    func updateIgnoredTargets(_ targets: [IgnoredTarget]) {
        toolMatcher.updateIgnoredTargets(targets)
    }

    func updateSettings(_ settings: AppSettings) {
        self.settings = settings
        windowTitleDetector.setEnabled(settings.windowTitleDetectionEnabled)

        if settings.detectionEnabled && detectionStatus == .disabled {
            startDetection()
        } else if !settings.detectionEnabled && detectionStatus == .running {
            stopDetection()
        }
    }

    // MARK: - Private

    private func loadToolCatalog() {
        // Catalog is loaded externally via updateToolCatalog() called from AppDelegate.
        // Here we only ensure the catalog is not empty.
        if toolMatcher.catalogCount == 0 {
            print("[Murmur] Warning: Tool catalog is empty — detection may not identify AI apps. Load catalog via updateToolCatalog().")
        }
    }

    private func handleNewSession(_ session: DetectedSession) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // Only keep a rolling window in memory; persistence is handled by onNewSession callback
            self.detectedSessions.append(session)
            if self.detectedSessions.count > 200 {
                self.detectedSessions = Array(self.detectedSessions.suffix(100))
            }
            // onNewSession callback should be bound to StorageManager.saveSessions by AppDelegate
            self.onNewSession?(session)
        }
    }

    private func updateStatus(_ status: DetectionStatus) {
        DispatchQueue.main.async { [weak self] in
            self?.detectionStatus = status
            self?.onStatusChanged?(status)
        }
    }

    // MARK: - Accessors

    var currentAppName: String? { appDetector.currentAppName }
    var currentBundleId: String? { appDetector.currentBundleId }
    var isAIApp: Bool { appDetector.isAIApp }
    var currentToolName: String? { appDetector.currentToolName }

    var remainingPauseDuration: TimeInterval? {
        guard let endDate = pauseEndDate else { return nil }
        let remaining = endDate.timeIntervalSinceNow
        return remaining > 0 ? remaining : nil
    }

    var pauseEndTimeFormatted: String? {
        guard let remaining = remainingPauseDuration else { return nil }
        let minutes = Int(ceil(remaining / 60))
        return "\(minutes)分钟"
    }
}
