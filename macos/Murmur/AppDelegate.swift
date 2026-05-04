import SwiftUI
import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        let coordinator = AppDelegateCoordinator.shared
        guard let detectionManager = coordinator.detectionManager,
              let storageManager = coordinator.storageManager else {
            print("[Murmur] Coordinator not configured — detection will not start")
            return
        }

        // Load tool catalog into detection manager
        let tools = storageManager.loadToolCatalog()
        detectionManager.updateToolCatalog(tools)
        let ignoredTargets = storageManager.loadIgnoredTargets()
        detectionManager.updateIgnoredTargets(ignoredTargets)

        // Bind detection → persistence (uses appendSession for local-only detections)
        detectionManager.onNewSession = { session in
            storageManager.appendSession(session)
        }

        // Request notification permission
        Task {
            _ = await NotificationManager.shared.requestPermission()
        }

        // Start detection automatically on launch
        detectionManager.startDetection()

        // Set up NSWorkspace notification observers
        let workspace = NSWorkspace.shared
        let notificationCenter = workspace.notificationCenter
        notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak detectionManager] notification in
            detectionManager?.handleAppActivation(notification)
        }

        // Schedule periodic pending reminders
        NotificationManager.shared.schedulePendingReminder()
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppDelegateCoordinator.shared.detectionManager?.stopDetection()
        NSWorkspace.shared.notificationCenter.removeObserver(self)
        NotificationManager.shared.cancelAllPendingReminders()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }
}
