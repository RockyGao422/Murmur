import Foundation

/// Scans the import queue directory for sessions sent by the browser extension
/// via Native Messaging helper, and ingests them into the main app's storage.
final class ImportQueueService {

    private let storageManager: StorageManager
    private let fileManager = FileManager.default
    private let queueDir: URL
    private let importedDir: URL
    private let failedDir: URL

    init(storageManager: StorageManager = StorageManager.shared) {
        self.storageManager = storageManager

        let appSupport = storageManager.appSupportURL
        self.queueDir = appSupport.appendingPathComponent("import_queue")
        self.importedDir = appSupport.appendingPathComponent("import_queue/imported")
        self.failedDir = appSupport.appendingPathComponent("import_queue/failed")

        // Ensure directories exist
        try? fileManager.createDirectory(at: queueDir, withIntermediateDirectories: true)
        try? fileManager.createDirectory(at: importedDir, withIntermediateDirectories: true)
        try? fileManager.createDirectory(at: failedDir, withIntermediateDirectories: true)
    }

    // MARK: - Queue Processing

    /// Scan the import queue and process all pending session files.
    /// Returns the number of successfully imported sessions.
    @discardableResult
    func scanImportQueue() -> Int {
        let jsonDecoder = JSONDecoder()
        jsonDecoder.dateDecodingStrategy = .iso8601

        guard let files = try? fileManager.contentsOfDirectory(at: queueDir, includingPropertiesForKeys: nil) else {
            return 0
        }

        let jsonFiles = files.filter { $0.pathExtension == "json" }
        var importedCount = 0

        for fileURL in jsonFiles {
            do {
                let data = try Data(contentsOf: fileURL)
                let message = try jsonDecoder.decode(NMImportMessage.self, from: data)

                guard message.type == "detected_session.upsert", message.schemaVersion == 1 else {
                    moveToFailed(fileURL, reason: "Unsupported message type or schema version")
                    continue
                }

                let session = convertToSession(message.payload)
                storageManager.upsertSession(session)

                moveToImported(fileURL)
                importedCount += 1
            } catch {
                print("[ImportQueue] Failed to process \(fileURL.lastPathComponent): \(error)")
                moveToFailed(fileURL, reason: error.localizedDescription)
            }
        }

        if importedCount > 0 {
            print("[ImportQueue] Imported \(importedCount) sessions")
        }
        return importedCount
    }

    // MARK: - Directory Helpers

    func queueDirectoryURL() -> URL { queueDir }

    private func moveToImported(_ url: URL) {
        let dest = importedDir.appendingPathComponent(url.lastPathComponent)
        try? fileManager.moveItem(at: url, to: dest)
    }

    private func moveToFailed(_ url: URL, reason: String) {
        let dest = failedDir.appendingPathComponent(url.lastPathComponent)
        try? fileManager.moveItem(at: url, to: dest)
        // Write error log alongside
        let logURL = dest.appendingPathExtension("error")
        try? reason.write(to: logURL, atomically: true, encoding: .utf8)
    }

    // MARK: - Conversion

    private func convertToSession(_ payload: NMSessionPayload) -> DetectedSession {
        let formatter = ISO8601DateFormatter()
        let now = Date()
        let dateStr = ISO8601DateFormatter().string(from: now).prefix(10)

        return DetectedSession(
            id: payload.id,
            sourcePlatform: .browser,
            sourceKind: .web,
            detectorId: payload.detectorId ?? "browser.extension",
            toolId: payload.toolId,
            toolName: payload.toolName,
            rawAppName: nil,
            rawBundleId: nil,
            rawPackageName: nil,
            rawDomain: payload.rawDomain,
            rawUrlPattern: payload.rawUrlPattern,
            windowTitleHash: nil,
            startedAt: formatter.date(from: payload.startedAt) ?? now,
            endedAt: formatter.date(from: payload.endedAt) ?? now,
            activeSeconds: payload.activeSeconds,
            idleSeconds: payload.idleSeconds ?? 0,
            localDate: payload.localDate ?? String(dateStr),
            timezone: payload.timezone ?? TimeZone.current.identifier,
            isNight: payload.isNight ?? false,
            confidence: payload.confidence,
            status: payload.status == "pending" ? .pending : .suspected,
            mergedIntoSessionId: nil,
            promptCount: payload.promptCount,
            deviceId: payload.deviceId ?? "",
            sourceSessionId: nil,
            sourceFingerprint: payload.sourceFingerprint,
            syncStatus: .synced,
            syncedAt: now,
            createdAt: now,
            updatedAt: now
        )
    }
}

// MARK: - Import Message Models

struct NMImportMessage: Codable {
    let type: String
    let schemaVersion: Int
    let sentAt: String?
    let payload: NMSessionPayload

    enum CodingKeys: String, CodingKey {
        case type
        case schemaVersion = "schema_version"
        case sentAt = "sent_at"
        case payload
    }
}

struct NMSessionPayload: Codable {
    let id: String
    let deviceId: String?
    let sourcePlatform: String?
    let sourceKind: String?
    let detectorId: String?
    let toolId: String
    let toolName: String?
    let rawDomain: String?
    let rawUrlPattern: String?
    let startedAt: String
    let endedAt: String
    let activeSeconds: Int
    let idleSeconds: Int?
    let localDate: String?
    let timezone: String?
    let isNight: Bool?
    let confidence: Double
    let status: String?
    let promptCount: Int?
    let sourceFingerprint: String?

    enum CodingKeys: String, CodingKey {
        case id
        case deviceId = "device_id"
        case sourcePlatform = "source_platform"
        case sourceKind = "source_kind"
        case detectorId = "detector_id"
        case toolId = "tool_id"
        case toolName = "tool_name"
        case rawDomain = "raw_domain"
        case rawUrlPattern = "raw_url_pattern"
        case startedAt = "started_at"
        case endedAt = "ended_at"
        case activeSeconds = "active_seconds"
        case idleSeconds = "idle_seconds"
        case localDate = "local_date"
        case timezone
        case isNight = "is_night"
        case confidence
        case status
        case promptCount = "prompt_count"
        case sourceFingerprint = "source_fingerprint"
    }
}
