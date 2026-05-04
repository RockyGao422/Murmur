import Foundation

/// Installs/uninstalls the Native Messaging host manifest for Chrome and Edge.
/// The manifest tells the browser where to find the murmur-native-host executable.
final class ManifestInstaller {

    enum Browser: String, CaseIterable {
        case chrome
        case edge

        var displayName: String {
            switch self {
            case .chrome: return "Chrome"
            case .edge: return "Edge"
            }
        }

        var hostManifestDir: URL {
            let home = FileManager.default.homeDirectoryForCurrentUser
            let library = home.appendingPathComponent("Library/Application Support")
            switch self {
            case .chrome:
                return library.appendingPathComponent("Google/Chrome/NativeMessagingHosts")
            case .edge:
                return library.appendingPathComponent("Microsoft Edge/NativeMessagingHosts")
            }
        }
    }

    private let hostName = "app.murmur.native_host"
    private let fileManager = FileManager.default

    /// Validate an extension ID format (32 lowercase hex characters a-p).
    func validateExtensionId(_ id: String) -> Bool {
        let pattern = "^[a-p]{32}$"
        return id.range(of: pattern, options: .regularExpression) != nil
    }

    /// Generate the manifest JSON content for the given extension IDs.
    func generateManifest(extensionIds: [String], hostPath: String) -> Data? {
        let origins = extensionIds.map { "chrome-extension://\($0)/" }
        let manifest: [String: Any] = [
            "name": hostName,
            "description": "Murmur Native Messaging Host",
            "path": hostPath,
            "type": "stdio",
            "allowed_origins": origins
        ]
        return try? JSONSerialization.data(withJSONObject: manifest, options: .prettyPrinted)
    }

    /// Install host manifest for a specific browser.
    func install(for browser: Browser, extensionIds: [String], hostPath: String) -> Bool {
        guard let data = generateManifest(extensionIds: extensionIds, hostPath: hostPath) else {
            print("[ManifestInstaller] Failed to generate manifest JSON")
            return false
        }

        let dir = browser.hostManifestDir
        do {
            try fileManager.createDirectory(at: dir, withIntermediateDirectories: true)
            let manifestURL = dir.appendingPathComponent("\(hostName).json")
            try data.write(to: manifestURL, options: .atomic)
            print("[ManifestInstaller] Installed manifest for \(browser.displayName) at \(manifestURL.path)")
            return true
        } catch {
            print("[ManifestInstaller] Failed to install manifest for \(browser.displayName): \(error)")
            return false
        }
    }

    /// Uninstall host manifest for a specific browser.
    func uninstall(for browser: Browser) {
        let manifestURL = browser.hostManifestDir.appendingPathComponent("\(hostName).json")
        try? fileManager.removeItem(at: manifestURL)
        print("[ManifestInstaller] Uninstalled manifest for \(browser.displayName)")
    }

    /// Check if manifest is installed for a browser.
    func isInstalled(for browser: Browser) -> Bool {
        let manifestURL = browser.hostManifestDir.appendingPathComponent("\(hostName).json")
        return fileManager.fileExists(atPath: manifestURL.path)
    }
}
