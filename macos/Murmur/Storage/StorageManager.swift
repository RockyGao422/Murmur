import Foundation

class StorageManager: ObservableObject {
    private let fileManager = FileManager.default
    private let queue = DispatchQueue(label: "com.murmur.storage", attributes: .concurrent)
    private let jsonEncoder: JSONEncoder
    private let jsonDecoder: JSONDecoder

    var appSupportURL: URL {
        guard let url = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            fatalError("Cannot access Application Support directory")
        }
        let murmurURL = url.appendingPathComponent("Murmur")
        if !fileManager.fileExists(atPath: murmurURL.path) {
            try? fileManager.createDirectory(at: murmurURL, withIntermediateDirectories: true)
        }
        return murmurURL
    }

    init() {
        jsonEncoder = JSONEncoder()
        jsonEncoder.dateEncodingStrategy = .iso8601
        jsonEncoder.outputFormatting = [.prettyPrinted, .sortedKeys]

        jsonDecoder = JSONDecoder()
        jsonDecoder.dateDecodingStrategy = .iso8601

        // Load default tool catalog on first launch
        initializeDefaultToolCatalog()
    }

    // MARK: - File Paths

    private var sessionsURL: URL { appSupportURL.appendingPathComponent("detected_sessions.json") }
    private var entriesURL: URL { appSupportURL.appendingPathComponent("ledger_entries.json") }
    private var toolCatalogURL: URL { appSupportURL.appendingPathComponent("tool_catalog.json") }
    private var ignoredTargetsURL: URL { appSupportURL.appendingPathComponent("ignored_targets.json") }
    private var dailySummariesURL: URL { appSupportURL.appendingPathComponent("daily_summaries.json") }
    private var settingsURL: URL { appSupportURL.appendingPathComponent("settings.json") }

    // MARK: - Sessions

    func loadSessions() -> [DetectedSession] {
        return load(from: sessionsURL) ?? []
    }

    func loadSessions(forDate localDate: String) -> [DetectedSession] {
        return loadSessions().filter { $0.localDate == localDate }
    }

    func saveSessions(_ sessions: [DetectedSession]) {
        save(sessions, to: sessionsURL)
    }

    /// Append a single session — for local detection results (no dedup needed).
    func appendSession(_ session: DetectedSession) {
        var sessions = loadSessions()
        sessions.append(session)
        saveSessions(sessions)
    }

    /// Upsert a session by id or source_fingerprint. For import/sync scenarios.
    func upsertSession(_ session: DetectedSession) {
        var sessions = loadSessions()

        // Check by id first
        if let idx = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[idx] = session
            saveSessions(sessions)
            return
        }

        // Check by source_fingerprint
        if let fingerprint = session.sourceFingerprint, !fingerprint.isEmpty,
           let idx = sessions.firstIndex(where: { $0.sourceFingerprint == fingerprint }) {
            // Update existing with imported data
            var updated = sessions[idx]
            updated.activeSeconds = session.activeSeconds
            updated.endedAt = session.endedAt
            updated.status = session.status
            updated.syncStatus = session.syncStatus
            updated.syncedAt = session.syncedAt
            updated.updatedAt = Date()
            sessions[idx] = updated
            saveSessions(sessions)
            return
        }

        // Not found — append
        sessions.append(session)
        saveSessions(sessions)
    }

    // MARK: - Entries

    func loadEntries() -> [LedgerEntry] {
        return load(from: entriesURL) ?? []
    }

    func saveEntries(_ entries: [LedgerEntry]) {
        save(entries, to: entriesURL)
    }

    // MARK: - Tool Catalog

    func loadToolCatalog() -> [ToolCatalogItem] {
        if let catalog: ToolCatalog = load(from: toolCatalogURL) {
            return catalog.tools
        }
        return []
    }

    func saveToolCatalog(_ tools: [ToolCatalogItem]) {
        let catalog = ToolCatalog(
            version: "1.0.0",
            updatedAt: ISO8601DateFormatter().string(from: Date()),
            description: "Murmur AI Tool Catalog",
            tools: tools
        )
        save(catalog, to: toolCatalogURL)
    }

    // MARK: - Ignored Targets

    func loadIgnoredTargets() -> [IgnoredTarget] {
        return load(from: ignoredTargetsURL) ?? []
    }

    func saveIgnoredTargets(_ targets: [IgnoredTarget]) {
        save(targets, to: ignoredTargetsURL)
    }

    // MARK: - Daily Summaries

    func loadDailySummaries() -> [DailySummary] {
        return load(from: dailySummariesURL) ?? []
    }

    func saveDailySummaries(_ summaries: [DailySummary]) {
        save(summaries, to: dailySummariesURL)
    }

    // MARK: - Settings

    func loadSettings() -> AppSettings {
        return load(from: settingsURL) ?? AppSettings()
    }

    func saveSettings(_ settings: AppSettings) {
        save(settings, to: settingsURL)
    }

    // MARK: - Generic Load/Save

    private func load<T: Decodable>(from url: URL) -> T? {
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try jsonDecoder.decode(T.self, from: data)
        } catch {
            print("[StorageManager] Failed to load from \(url.lastPathComponent): \(error)")
            return nil
        }
    }

    private func save<T: Encodable>(_ value: T, to url: URL) {
        queue.async(flags: .barrier) { [weak self] in
            guard let self = self else { return }
            do {
                let data = try self.jsonEncoder.encode(value)
                try data.write(to: url, options: .atomic)
            } catch {
                print("[StorageManager] Failed to save to \(url.lastPathComponent): \(error)")
            }
        }
    }

    // MARK: - Default Tool Catalog Initialization

    private func initializeDefaultToolCatalog() {
        let catalogURL = toolCatalogURL
        guard !fileManager.fileExists(atPath: catalogURL.path) else { return }

        // Try to load from bundle resource first
        if let bundleURL = Bundle.main.url(forResource: "tool-catalog", withExtension: "json"),
           let data = try? Data(contentsOf: bundleURL),
           let catalog: ToolCatalog = try? jsonDecoder.decode(ToolCatalog.self, from: data) {
            save(catalog, to: catalogURL)
            print("[StorageManager] Initialized tool catalog from bundle resource")
            return
        }

        // Fallback: search relative to executable for development builds
        if let executableURL = Bundle.main.executableURL {
            let devSharedURL = executableURL
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("shared/tool-catalog.json")
            if fileManager.fileExists(atPath: devSharedURL.path),
               let data = try? Data(contentsOf: devSharedURL),
               let catalog: ToolCatalog = try? jsonDecoder.decode(ToolCatalog.self, from: data) {
                save(catalog, to: catalogURL)
                print("[StorageManager] Initialized tool catalog from shared directory")
                return
            }
        }

        print("[StorageManager] Warning: No default tool catalog found. Ensure tool-catalog.json is in the app bundle.")
    }

    // MARK: - Data Export

    func exportAllData() -> [String: Data] {
        var result: [String: Data] = [:]
        if let sessions: [DetectedSession] = load(from: sessionsURL) {
            result["detected_sessions.json"] = try? jsonEncoder.encode(sessions)
        }
        if let entries: [LedgerEntry] = load(from: entriesURL) {
            result["ledger_entries.json"] = try? jsonEncoder.encode(entries)
        }
        if let catalog: ToolCatalog = load(from: toolCatalogURL) {
            result["tool_catalog.json"] = try? jsonEncoder.encode(catalog)
        }
        return result
    }

    // MARK: - Clear All Data

    func clearAllData() {
        let urls = [sessionsURL, entriesURL, toolCatalogURL, ignoredTargetsURL, dailySummariesURL, settingsURL]
        for url in urls {
            try? fileManager.removeItem(at: url)
        }
        // Re-initialize default catalog
        initializeDefaultToolCatalog()
    }
}

// MARK: - App Settings Model

struct AppSettings: Codable {
    var detectionEnabled: Bool = true
    var windowTitleDetectionEnabled: Bool = false
    var extensionConnected: Bool = false
    var nativeMessagingEnabled: Bool = false
    var notificationsEnabled: Bool = true
    var reminderDelayMinutes: Int = 30
    var dataRetentionDays: Int = 365
    var nightHoursStart: Int = 22 // 22:00
    var nightHoursEnd: Int = 6 // 06:00
    var lastExportDate: Date?
    var appVersion: String = "1.0.0"

    enum CodingKeys: String, CodingKey {
        case detectionEnabled = "detection_enabled"
        case windowTitleDetectionEnabled = "window_title_detection_enabled"
        case extensionConnected = "extension_connected"
        case nativeMessagingEnabled = "native_messaging_enabled"
        case notificationsEnabled = "notifications_enabled"
        case reminderDelayMinutes = "reminder_delay_minutes"
        case dataRetentionDays = "data_retention_days"
        case nightHoursStart = "night_hours_start"
        case nightHoursEnd = "night_hours_end"
        case lastExportDate = "last_export_date"
        case appVersion = "app_version"
    }
}
