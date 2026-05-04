import Foundation

/// Receives detected sessions from the browser extension via Native Messaging.
/// Reads JSON messages from stdin, writes acknowledgements to stdout.
/// Each message contains a detected session from the browser extension.
final class NativeMessagingHost {
    static let shared = NativeMessagingHost()

    private let storageManager = StorageManager.shared
    private var isRunning = false
    private let queue = DispatchQueue(label: "app.murmur.native-messaging")

    struct BrowserSessionMessage: Codable {
        let type: String
        let schemaVersion: Int
        let sentAt: String?
        let payload: BrowserSessionPayload

        enum CodingKeys: String, CodingKey {
            case type
            case schemaVersion = "schema_version"
            case sentAt = "sent_at"
            case payload
        }
    }

    struct BrowserSessionPayload: Codable {
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

    struct HostResponse: Codable {
        let status: String
        let message: String
        let sessionId: String?
    }

    private init() {}

    func start() {
        guard !isRunning else { return }
        isRunning = true
        queue.async { [weak self] in
            self?.readLoop()
        }
    }

    func stop() {
        isRunning = false
    }

    private func readLoop() {
        let stdin = FileHandle.standardInput
        let decoder = JSONDecoder()
        let encoder = JSONEncoder()

        while isRunning {
            guard let lengthData = try? stdin.read(upToCount: 4),
                  lengthData.count == 4 else {
                break
            }
            let messageLength = UInt32(littleEndian: lengthData.withUnsafeBytes { $0.load(as: UInt32.self) })
            guard messageLength > 0, messageLength < 1_048_576, // 1MB max
                  let messageData = try? stdin.read(upToCount: Int(messageLength)),
                  messageData.count == Int(messageLength) else {
                break
            }

            do {
                let message = try decoder.decode(BrowserSessionMessage.self, from: messageData)
                try handleMessage(message, encoder: encoder)
            } catch {
                sendResponse(HostResponse(status: "error", message: "Parse error: \(error.localizedDescription)", sessionId: nil), encoder: encoder)
            }
        }
    }

    private func handleMessage(_ message: BrowserSessionMessage, encoder: JSONEncoder) throws {
        // Accept both old and new message types for compatibility
        let validTypes = ["detected_session", "detected_session.upsert"]
        guard validTypes.contains(message.type), message.schemaVersion == 1 else {
            sendResponse(HostResponse(status: "error", message: "Unknown message type or version", sessionId: nil), encoder: encoder)
            return
        }

        let payload = message.payload
        let formatter = ISO8601DateFormatter()
        let now = Date()
        let dateStr = ISO8601DateFormatter().string(from: now).prefix(10)

        let session = DetectedSession(
            id: payload.id,
            sourcePlatform: .browser,
            sourceKind: .web,
            detectorId: "browser.extension",
            toolId: payload.toolId,
            toolName: payload.toolName ?? payload.toolId,
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
            isNight: payload.isNight ?? isNightHour(now),
            confidence: payload.confidence,
            status: confidenceMeetsThreshold(payload.confidence) ? .pending : .suspected,
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

        // Use upsert for idempotent import (dedup by id or source_fingerprint)
        storageManager.upsertSession(session)

        sendResponse(HostResponse(status: "ok", message: "Session upserted", sessionId: session.id), encoder: encoder)
    }

    private func confidenceMeetsThreshold(_ confidence: Double) -> Bool {
        confidence >= 0.7
    }

    private func isNightHour(_ date: Date) -> Bool {
        let hour = Calendar.current.component(.hour, from: date)
        return hour >= 22 || hour < 6
    }

    private func sendResponse(_ response: HostResponse, encoder: JSONEncoder) {
        guard let data = try? encoder.encode(response) else { return }
        var length = UInt32(data.count).littleEndian
        let lengthData = Data(bytes: &length, count: 4)
        let stdout = FileHandle.standardOutput
        stdout.write(lengthData)
        stdout.write(data)
    }
}
