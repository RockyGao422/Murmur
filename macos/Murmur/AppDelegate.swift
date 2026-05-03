import SwiftUI
import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {
    weak var detectionManager: DetectionManager?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Request notification permission
        Task {
            _ = await NotificationManager.shared.requestPermission()
        }

        // Start detection automatically on launch
        detectionManager?.startDetection()

        // Set up NSWorkspace notification observers
        let workspace = NSWorkspace.shared
        let notificationCenter = workspace.notificationCenter

        notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.detectionManager?.handleAppActivation(notification)
        }

        // Schedule periodic pending reminders
        NotificationManager.shared.schedulePendingReminder()
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Cleanup: stop detection, flush current session
        detectionManager?.stopDetection()

        // Remove workspace observers
        NSWorkspace.shared.notificationCenter.removeObserver(self)

        // Cancel pending notifications
        NotificationManager.shared.cancelAllPendingReminders()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }
}
