import Foundation
import UserNotifications

/// Manages local notification reminders for pending session completions.
final class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()

    private let center = UNUserNotificationCenter.current()
    private let storageManager = StorageManager.shared

    private override init() {
        super.init()
        center.delegate = self
    }

    func requestPermission() async -> Bool {
        do {
            return try await center.requestAuthorization(options: [.alert, .badge, .sound])
        } catch {
            return false
        }
    }

    func checkPermissionStatus(completion: @escaping (Bool) -> Void) {
        center.getNotificationSettings { settings in
            completion(settings.authorizationStatus == .authorized)
        }
    }

    func schedulePendingReminder() {
        let settings = storageManager.loadSettings()
        guard settings.notificationsEnabled else {
            cancelAllPendingReminders()
            return
        }

        let sessions = storageManager.loadSessions()
        let pendingCount = sessions.filter { $0.status == .pending }.count

        guard pendingCount > 0 else {
            cancelAllPendingReminders()
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Murmur"
        content.body = pendingCount == 1
            ? "有 1 条 AI 使用会话待补全"
            : "有 \(pendingCount) 条 AI 使用会话待补全"
        content.sound = .default
        content.badge = NSNumber(value: pendingCount)
        content.interruptionLevel = .timeSensitive

        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: TimeInterval(settings.reminderDelayMinutes * 60),
            repeats: false
        )

        let request = UNNotificationRequest(
            identifier: "app.murmur.pending-reminder",
            content: content,
            trigger: trigger
        )

        center.add(request) { error in
            if let error = error {
                print("[Murmur] Failed to schedule notification: \(error)")
            }
        }
    }

    func sendImmediateReminder(for sessionCount: Int) async {
        let hasPermission = await requestPermission()
        guard hasPermission else { return }

        let content = UNMutableNotificationContent()
        content.title = "Murmur"
        content.body = "刚刚检测到 AI 使用，记得补全哦"
        content.sound = .default
        content.interruptionLevel = .timeSensitive

        let request = UNNotificationRequest(
            identifier: "app.murmur.immediate-\(UUID().uuidString)",
            content: content,
            trigger: nil // immediate
        )

        do {
            try await center.add(request)
        } catch {
            print("[Murmur] Failed to send immediate notification: \(error)")
        }
    }

    func cancelAllPendingReminders() {
        center.removePendingNotificationRequests(withIdentifiers: ["app.murmur.pending-reminder"])
        center.removeAllDeliveredNotifications()
        center.setBadgeCount(0) { _ in }
    }

    // MARK: - UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
}
