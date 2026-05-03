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
        let payload: BrowserSessionPayload
    }

    struct BrowserSessionPayload: Codable {
        let id: String
        let sourcePlatform: String
        let toolId: String
        let toolName: String?
        let rawDomain: String
        let rawUrlPattern: String?
        let startedAt: String
        let endedAt: String
        let activeSeconds: Int
        let confidence: Double
        let promptCount: Int?
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
        guard message.type == "detected_session", message.schemaVersion == 1 else {
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
            idleSeconds: nil,
            localDate: String(dateStr),
            timezone: TimeZone.current.identifier,
            isNight: isNightHour(now),
            confidence: payload.confidence,
            status: confidenceMeetsThreshold(payload.confidence) ? .pending : .suspected,
            mergedIntoSessionId: nil,
            promptCount: payload.promptCount,
            createdAt: now,
            updatedAt: now
        )

        var sessions = storageManager.loadSessions()
        sessions.append(session)
        storageManager.saveSessions(sessions)

        sendResponse(HostResponse(status: "ok", message: "Session saved", sessionId: session.id), encoder: encoder)
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
