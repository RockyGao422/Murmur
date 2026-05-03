import Foundation
import ApplicationServices
import CryptoKit

class WindowTitleDetector {
    private(set) var isEnabled: Bool = false

    /// Enable or disable window title detection
    /// Requires Accessibility permission
    func setEnabled(_ enabled: Bool) {
        if enabled {
            let options = [kAXTrustedCheckOptionPrompt.takeRetainedValue() as String: true]
            let trusted = AXIsProcessTrustedWithOptions(options as CFDictionary)
            isEnabled = trusted
        } else {
            isEnabled = false
        }
    }

    /// Check if accessibility permission is granted without prompting
    func checkAccessibilityPermission() -> Bool {
        return AXIsProcessTrusted()
    }

    /// Get the current frontmost window title, hashed with SHA256
    /// Returns nil if permission is not granted or title cannot be read
    func getCurrentWindowTitleHash() -> String? {
        guard isEnabled else { return nil }

        guard let title = getFrontmostWindowTitle() else { return nil }

        // SHA256 hash the title - never stored as plaintext
        guard let data = title.data(using: .utf8) else { return nil }
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    /// Get the raw window title from the frontmost application's focused window
    /// Returns the plaintext title - caller must hash before persisting
    private func getFrontmostWindowTitle() -> String? {
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return nil }

        let pid = frontApp.processIdentifier
        let appElement = AXUIElementCreateApplication(pid)

        // Get the focused window
        var focusedWindow: CFTypeRef?
        let windowResult = AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &focusedWindow)

        guard windowResult == .success, let window = focusedWindow else { return nil }

        // Get the window title
        var titleValue: CFTypeRef?
        let titleResult = AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &titleValue)

        guard titleResult == .success, let title = titleValue as? String else { return nil }

        return title
    }
}
