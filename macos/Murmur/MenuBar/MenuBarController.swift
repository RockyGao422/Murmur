import SwiftUI
import AppKit

class MenuBarController: ObservableObject {
    private var statusItem: NSStatusItem?
    private let detectionManager: DetectionManager
    private let storageManager: StorageManager
    private var updateTimer: Timer?

    @Published var todayDuration: String = "0分钟"
    @Published var pendingCount: Int = 0

    init(detectionManager: DetectionManager, storageManager: StorageManager) {
        self.detectionManager = detectionManager
        self.storageManager = storageManager
    }

    func setup() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            button.title = "M"
            button.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        }

        setupMenu()
        startUpdateTimer()
    }

    private func setupMenu() {
        let menu = NSMenu()

        // Status header
        let statusItem = NSMenuItem()
        statusItem.title = "Murmur - 检测中"
        statusItem.isEnabled = false
        menu.addItem(statusItem)

        // Today stats
        let statsItem = NSMenuItem()
        statsItem.title = "今日: 0分钟 | 待补全: 0"
        statsItem.isEnabled = false
        statsItem.identifier = NSUserInterfaceItemIdentifier("statsItem")
        menu.addItem(statsItem)

        menu.addItem(.separator())

        // Pause/Resume
        let pauseItem = NSMenuItem(title: "暂停检测", action: #selector(togglePause), keyEquivalent: "")
        pauseItem.target = self
        pauseItem.identifier = NSUserInterfaceItemIdentifier("pauseItem")
        menu.addItem(pauseItem)

        menu.addItem(.separator())

        // Open Dashboard
        let dashboardItem = NSMenuItem(title: "打开控制台", action: #selector(openDashboard), keyEquivalent: "")
        dashboardItem.target = self
        menu.addItem(dashboardItem)

        // Open Inbox
        let inboxItem = NSMenuItem(title: "打开待补全", action: #selector(openInbox), keyEquivalent: "")
        inboxItem.target = self
        menu.addItem(inboxItem)

        menu.addItem(.separator())

        // Quit
        let quitItem = NSMenuItem(title: "退出", action: #selector(quitApp), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem?.menu = menu
        updateMenu()
    }

    func updateMenu() {
        let today = localDateString()
        let sessions = storageManager.loadSessions().filter { $0.localDate == today }
        let totalActive = sessions.reduce(0) { $0 + $1.activeSeconds }
        let pending = sessions.filter { $0.status == .pending }.count

        todayDuration = formatDuration(seconds: totalActive)
        pendingCount = pending

        // Update button title
        if let button = statusItem?.button {
            if pending > 0 {
                button.title = "\(pending)"
            } else {
                button.title = "M"
            }
        }

        // Update menu items
        if let menu = statusItem?.menu {
            if let statsItem = menu.item(withIdentifier: NSUserInterfaceItemIdentifier("statsItem")) {
                statsItem.title = "今日: \(todayDuration) | 待补全: \(pending)"
            }

            let status = detectionManager.detectionStatus
            if let statusHeader = menu.items.first {
                statusHeader.title = "Murmur - \(status.displayName)"
            }

            if let pauseItem = menu.item(withIdentifier: NSUserInterfaceItemIdentifier("pauseItem")) {
                pauseItem.title = status == .running ? "暂停检测" : "恢复检测"
            }
        }
    }

    private func startUpdateTimer() {
        updateTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            self?.updateMenu()
        }
    }

    // MARK: - Actions

    @objc private func togglePause() {
        if detectionManager.detectionStatus == .running {
            detectionManager.pauseDetection()
        } else {
            detectionManager.resumeDetection()
        }
        updateMenu()
    }

    @objc private func openDashboard() {
        NSApp.activate(ignoringOtherApps: true)
        if let window = NSApp.windows.first {
            window.makeKeyAndOrderFront(nil)
        }
    }

    @objc private func openInbox() {
        NSApp.activate(ignoringOtherApps: true)
        if let window = NSApp.windows.first {
            window.makeKeyAndOrderFront(nil)
        }
        // Post notification to switch to inbox tab
        NotificationCenter.default.post(name: .switchToInboxTab, object: nil)
    }

    @objc private func quitApp() {
        NSApplication.shared.terminate(nil)
    }

    func teardown() {
        updateTimer?.invalidate()
        updateTimer = nil
        if let statusItem = statusItem {
            NSStatusBar.system.removeStatusItem(statusItem)
        }
    }

    // MARK: - Helpers

    private func localDateString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    private func formatDuration(seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        if hours > 0 {
            return "\(hours)时\(minutes)分"
        }
        return "\(minutes)分钟"
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let switchToInboxTab = Notification.Name("switchToInboxTab")
}
