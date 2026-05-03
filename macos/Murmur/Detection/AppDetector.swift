import Foundation
import AppKit

class AppDetector: ObservableObject {
    private let toolMatcher: ToolMatcher
    private let sessionizer: Sessionizer
    private let windowTitleDetector: WindowTitleDetector?

    @Published var currentAppName: String?
    @Published var currentBundleId: String?
    @Published var isAIApp: Bool = false
    @Published var currentToolName: String?

    var onSessionDetected: ((DetectedSession) -> Void)?

    init(toolMatcher: ToolMatcher, sessionizer: Sessionizer, windowTitleDetector: WindowTitleDetector? = nil) {
        self.toolMatcher = toolMatcher
        self.sessionizer = sessionizer
        self.windowTitleDetector = windowTitleDetector
    }

    // MARK: - Handle App Activation

    func handleAppActivation(_ notification: Notification) {
        guard let runningApp = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else {
            return
        }

        let appName = runningApp.localizedName ?? "Unknown"
        let bundleId = runningApp.bundleIdentifier

        updateCurrentApp(appName: appName, bundleId: bundleId)

        // Create raw event
        let event = createRawEvent(appName: appName, bundleId: bundleId)

        // Match against tool catalog
        let matchResult = toolMatcher.match(event: event)

        isAIApp = matchResult.matchedTool != nil
        currentToolName = matchResult.matchedTool?.name

        // Feed to sessionizer
        if let session = sessionizer.processEvent(event, matchResult: matchResult) {
            // Post-process the session before notifying
            var detectedSession = session

            // If window title detection is enabled, try to get window title hash
            if windowTitleDetector?.isEnabled == true {
                if let titleHash = windowTitleDetector?.getCurrentWindowTitleHash() {
                    detectedSession.windowTitleHash = titleHash
                }
            }

            onSessionDetected?(detectedSession)
        }
    }

    // MARK: - Handle App Termination

    func handleAppTermination(_ notification: Notification) {
        if let flushed = sessionizer.flushCurrentSession() {
            onSessionDetected?(flushed)
        }
    }

    // MARK: - Force Flush Current Session

    func forceFlushCurrentSession() -> DetectedSession? {
        return sessionizer.flushCurrentSession()
    }

    // MARK: - Manual App Check

    func manualCheckCurrentApp() {
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }
        let appName = frontApp.localizedName ?? "Unknown"
        let bundleId = frontApp.bundleIdentifier

        updateCurrentApp(appName: appName, bundleId: bundleId)

        let event = createRawEvent(appName: appName, bundleId: bundleId)
        let matchResult = toolMatcher.match(event: event)

        isAIApp = matchResult.matchedTool != nil
        currentToolName = matchResult.matchedTool?.name

        if let session = sessionizer.processEvent(event, matchResult: matchResult) {
            onSessionDetected?(session)
        }
    }

    // MARK: - Private Helpers

    private func updateCurrentApp(appName: String, bundleId: String?) {
        DispatchQueue.main.async { [weak self] in
            self?.currentAppName = appName
            self?.currentBundleId = bundleId
        }
    }

    private func createRawEvent(appName: String, bundleId: String?) -> RawEvent {
        return RawEvent(
            eventId: UUID().uuidString,
            platform: .macos,
            eventType: .foreground,
            timestamp: Date(),
            appName: appName,
            bundleId: bundleId,
            packageName: nil,
            domain: nil,
            urlPattern: nil,
            windowTitle: nil,
            windowTitleHash: nil,
            tabId: nil,
            windowId: nil
        )
    }

    // MARK: - State Reset

    func reset() {
        sessionizer.reset()
        currentAppName = nil
        currentBundleId = nil
        isAIApp = false
        currentToolName = nil
    }
}
