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

    /// Bundle IDs of known browsers — these should never be treated as AI tools.
    private let browserBundleIds: Set<String> = [
        "com.apple.Safari",
        "com.google.Chrome",
        "com.microsoft.edgemac",
        "company.thebrowser.Browser",
        "org.mozilla.firefox",
        "com.brave.Browser",
        "com.operasoftware.Opera",
        "com.vivaldi.Vivaldi",
    ]

    private func isBrowser(_ bundleId: String?) -> Bool {
        guard let bundleId else { return false }
        return browserBundleIds.contains(bundleId)
    }

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

        // Browsers are never AI tools — skip matching entirely
        guard !isBrowser(bundleId) else {
            isAIApp = false
            currentToolName = nil
            // Flush current session if we had one (switched to browser)
            let flushed = sessionizer.flushCurrentSession()
            for session in flushed {
                onSessionDetected?(session)
            }
            return
        }

        let event = createRawEvent(appName: appName, bundleId: bundleId)
        let matchResult = toolMatcher.match(event: event)

        isAIApp = matchResult.matchedTool != nil
        currentToolName = matchResult.matchedTool?.name

        // processEvent now returns [DetectedSession] (may be empty, one, or two after midnight split)
        let sessions = sessionizer.processEvent(event, matchResult: matchResult)
        for var session in sessions {
            if windowTitleDetector?.isEnabled == true,
               let titleHash = windowTitleDetector?.getCurrentWindowTitleHash() {
                session.windowTitleHash = titleHash
            }
            onSessionDetected?(session)
        }
    }

    // MARK: - Handle App Termination

    func handleAppTermination(_ notification: Notification) {
        // flushCurrentSession now returns [DetectedSession]
        for session in sessionizer.flushCurrentSession() {
            onSessionDetected?(session)
        }
    }

    // MARK: - Force Flush Current Session

    func forceFlushCurrentSession() -> [DetectedSession] {
        return sessionizer.flushCurrentSession()
    }

    // MARK: - Manual App Check

    func manualCheckCurrentApp() {
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }
        let appName = frontApp.localizedName ?? "Unknown"
        let bundleId = frontApp.bundleIdentifier

        updateCurrentApp(appName: appName, bundleId: bundleId)

        // Skip browsers
        guard !isBrowser(bundleId) else {
            isAIApp = false
            currentToolName = nil
            return
        }

        let event = createRawEvent(appName: appName, bundleId: bundleId)
        let matchResult = toolMatcher.match(event: event)

        isAIApp = matchResult.matchedTool != nil
        currentToolName = matchResult.matchedTool?.name

        for session in sessionizer.processEvent(event, matchResult: matchResult) {
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

    func reset() {
        sessionizer.reset()
        currentAppName = nil
        currentBundleId = nil
        isAIApp = false
        currentToolName = nil
    }
}
