import Foundation
import Combine
import AppKit

@MainActor
class SettingsViewModel: ObservableObject {
    private let storageManager: StorageManager
    private let detectionManager: DetectionManager
    private let csvExporter = CSVExporter()
    private let markdownExporter = MarkdownExporter()

    @Published var detectionEnabled: Bool = true
    @Published var windowTitleDetectionEnabled: Bool = false
    @Published var extensionConnected: Bool = false
    @Published var nativeMessagingEnabled: Bool = false
    @Published var notificationsEnabled: Bool = true
    @Published var reminderDelayMinutes: Int = 30
    @Published var dataRetentionDays: Int = 365
    @Published var nightHoursStart: Int = 22
    @Published var nightHoursEnd: Int = 6
    @Published var appVersion: String = "1.0.0"
    @Published var accessibilityGranted: Bool = false
    @Published var showClearConfirmation: Bool = false
    @Published var exportSuccessMessage: String?
    @Published var notificationPermissionGranted: Bool = false

    private var settings: AppSettings

    init(storageManager: StorageManager, detectionManager: DetectionManager) {
        self.storageManager = storageManager
        self.detectionManager = detectionManager
        self.settings = storageManager.loadSettings()
        loadFromSettings()
    }

    func loadSettings() {
        settings = storageManager.loadSettings()
        loadFromSettings()
        accessibilityGranted = WindowTitleDetector().checkAccessibilityPermission()
        NotificationManager.shared.checkPermissionStatus { [weak self] granted in
            DispatchQueue.main.async {
                self?.notificationPermissionGranted = granted
            }
        }
    }

    private func loadFromSettings() {
        detectionEnabled = settings.detectionEnabled
        windowTitleDetectionEnabled = settings.windowTitleDetectionEnabled
        extensionConnected = settings.extensionConnected
        nativeMessagingEnabled = settings.nativeMessagingEnabled
        notificationsEnabled = settings.notificationsEnabled
        reminderDelayMinutes = settings.reminderDelayMinutes
        dataRetentionDays = settings.dataRetentionDays
        nightHoursStart = settings.nightHoursStart
        nightHoursEnd = settings.nightHoursEnd
        appVersion = settings.appVersion
    }

    func toggleDetection() {
        detectionEnabled.toggle()
        settings.detectionEnabled = detectionEnabled
        storageManager.saveSettings(settings)
        detectionManager.updateSettings(settings)
    }

    func toggleWindowTitleDetection() {
        if !windowTitleDetectionEnabled {
            // Request accessibility permission
            let options = [kAXTrustedCheckOptionPrompt.takeRetainedValue() as String: true]
            let trusted = AXIsProcessTrustedWithOptions(options as CFDictionary)
            accessibilityGranted = trusted
            if trusted {
                windowTitleDetectionEnabled = true
            }
        } else {
            windowTitleDetectionEnabled = false
        }
        settings.windowTitleDetectionEnabled = windowTitleDetectionEnabled
        storageManager.saveSettings(settings)
        detectionManager.updateSettings(settings)
    }

    func setNightHours(start: Int, end: Int) {
        nightHoursStart = start
        nightHoursEnd = end
        settings.nightHoursStart = start
        settings.nightHoursEnd = end
        storageManager.saveSettings(settings)
    }

    func setDataRetention(days: Int) {
        dataRetentionDays = days
        settings.dataRetentionDays = days
        storageManager.saveSettings(settings)
    }

    // MARK: - Export CSV

    func exportCSV() {
        let savePanel = NSSavePanel()
        savePanel.title = "导出 CSV"
        savePanel.nameFieldStringValue = "Murmur_Export_\(formattedDate())"
        savePanel.canCreateDirectories = true
        savePanel.prompt = "导出"

        savePanel.begin { [weak self] response in
            guard response == .OK, let directoryURL = savePanel.url else { return }

            DispatchQueue.main.async {
                self?.performExport(to: directoryURL)
            }
        }
    }

    private func performExport(to directoryURL: URL) {
        let sessions = storageManager.loadSessions()
        let entries = storageManager.loadEntries()

        let sessionsURL = directoryURL.appendingPathComponent("detected_sessions.csv")
        let entriesURL = directoryURL.appendingPathComponent("ledger_entries.csv")

        do {
            try csvExporter.exportSessions(sessions, to: sessionsURL)
            try csvExporter.exportEntries(entries, to: entriesURL)
            exportSuccessMessage = "导出成功：\(directoryURL.path)"
        } catch {
            exportSuccessMessage = "导出失败：\(error.localizedDescription)"
        }
    }

    // MARK: - Clear All Data

    func clearAllData() {
        storageManager.clearAllData()
        detectionManager.stopDetection()
        settings = AppSettings()
        storageManager.saveSettings(settings)
        loadFromSettings()
        showClearConfirmation = false

        // Restart detection
        detectionManager.startDetection()
    }

    // MARK: - Pause Detection

    func pauseDetection(durationHours: Double? = nil) {
        if let hours = durationHours {
            detectionManager.pauseDetection(duration: hours * 3600)
        } else {
            detectionManager.pauseDetection()
        }
    }

    func resumeDetection() {
        detectionManager.resumeDetection()
    }

    // MARK: - Native Messaging

    func toggleNativeMessaging() {
        nativeMessagingEnabled.toggle()
        settings.nativeMessagingEnabled = nativeMessagingEnabled
        storageManager.saveSettings(settings)

        if nativeMessagingEnabled {
            NativeMessagingHost.shared.start()
        } else {
            NativeMessagingHost.shared.stop()
        }
    }

    // MARK: - Notifications

    func toggleNotifications() {
        notificationsEnabled.toggle()
        settings.notificationsEnabled = notificationsEnabled
        storageManager.saveSettings(settings)

        if notificationsEnabled {
            NotificationManager.shared.schedulePendingReminder()
        } else {
            NotificationManager.shared.cancelAllPendingReminders()
        }
    }

    func requestNotificationPermission() async {
        let granted = await NotificationManager.shared.requestPermission()
        notificationPermissionGranted = granted
    }

    func setReminderDelay(_ minutes: Int) {
        reminderDelayMinutes = minutes
        settings.reminderDelayMinutes = minutes
        storageManager.saveSettings(settings)
    }

    // MARK: - Markdown Export

    func exportMarkdown() {
        let savePanel = NSSavePanel()
        savePanel.title = "导出 Markdown 周报"
        savePanel.nameFieldStringValue = "Murmur_Weekly_Report_\(formattedDate()).md"
        savePanel.canCreateDirectories = true
        savePanel.prompt = "导出"
        savePanel.allowedContentTypes = [.plainText]

        savePanel.begin { [weak self] response in
            guard response == .OK, let fileURL = savePanel.url else { return }

            DispatchQueue.main.async {
                self?.performMarkdownExport(to: fileURL)
            }
        }
    }

    private func performMarkdownExport(to fileURL: URL) {
        let sessions = storageManager.loadSessions()
        let entries = storageManager.loadEntries()
        let weeklyData = MarkdownExporter.WeeklyData(date: Date(), storageManager: storageManager)
        let markdown = markdownExporter.exportMarkdown(for: weeklyData)

        do {
            try markdown.write(to: fileURL, atomically: true, encoding: .utf8)
            exportSuccessMessage = "Markdown 周报导出成功"
        } catch {
            exportSuccessMessage = "导出失败：\(error.localizedDescription)"
        }
    }

    // MARK: - Helpers

    private func formattedDate() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd_HHmmss"
        return formatter.string(from: Date())
    }

    var detectionStatusText: String {
        return detectionManager.detectionStatus.displayName
    }
}
