import Foundation
import CryptoKit

class Sessionizer {
    private var currentSession: DetectedSession?
    private var isInAISession: Bool = false
    private var lastEventTime: Date?
    private let idGenerator: () -> String
    private let timezone: TimeZone
    private let dateFormatter: ISO8601DateFormatter
    private let localDateFormatter: DateFormatter
    private let deviceId: String

    init(idGenerator: @escaping () -> String = { UUID().uuidString }) {
        self.idGenerator = idGenerator
        self.timezone = TimeZone.current
        self.dateFormatter = ISO8601DateFormatter()
        self.dateFormatter.timeZone = timezone
        self.localDateFormatter = DateFormatter()
        self.localDateFormatter.dateFormat = "yyyy-MM-dd"
        self.localDateFormatter.timeZone = timezone
        self.deviceId = Sessionizer.loadOrCreateDeviceId()
    }

    /// Load or create a per-installation device identifier stored in UserDefaults.
    static func loadOrCreateDeviceId() -> String {
        let key = "murmur_device_id"
        if let existing = UserDefaults.standard.string(forKey: key), !existing.isEmpty {
            return existing
        }
        let newId = UUID().uuidString
        UserDefaults.standard.set(newId, forKey: key)
        return newId
    }

    /// Compute a source fingerprint for idempotent dedup using SHA-256.
    private func computeFingerprint(session: DetectedSession) -> String {
        let raw = [
            session.sourcePlatform.rawValue,
            session.sourceKind.rawValue,
            deviceId,
            session.toolId ?? "",
            session.rawBundleId ?? session.rawDomain ?? "",
            String(Int(session.startedAt.timeIntervalSince1970 / 5)),
            String(Int(session.endedAt.timeIntervalSince1970 / 5)),
            String(session.activeSeconds)
        ].joined(separator: "|")

        let data = Data(raw.utf8)
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Process Event

    /// Process a new RawEvent through the sessionizer.
    /// Returns an array of completed sessions (may be empty, one, or two when crossing midnight).
    func processEvent(_ event: RawEvent, matchResult: ToolMatchResult) -> [DetectedSession] {
        let now = event.timestamp
        var completedSessions: [DetectedSession] = []

        // Check idle threshold (5 minutes) — flush any active session first
        if let lastTime = lastEventTime, now.timeIntervalSince(lastTime) > 300, isInAISession {
            let flushed = flushCurrentSession(at: lastTime)
            completedSessions.append(contentsOf: flushed)
            isInAISession = false
            currentSession = nil
        }

        lastEventTime = now

        let isAIEvent = matchResult.matchedTool != nil && !matchResult.shouldIgnore && matchResult.confidence >= 0.4

        if isAIEvent && !isInAISession {
            // Start new AI session. Flush any prior session first.
            let flushed = flushCurrentSession(at: now)
            completedSessions.append(contentsOf: flushed)
            startNewSession(event: event, matchResult: matchResult, at: now)
            isInAISession = true

        } else if isAIEvent && isInAISession {
            // Check if tool changed — if so, flush current and start new session
            if let currentToolId = currentSession?.toolId,
               let newToolId = matchResult.matchedTool?.id,
               currentToolId != newToolId {
                let flushed = flushCurrentSession(at: now)
                completedSessions.append(contentsOf: flushed)
                startNewSession(event: event, matchResult: matchResult, at: now)
                isInAISession = true
                return completedSessions
            }

            // Continuing same AI session — update end time
            currentSession?.endedAt = now
            currentSession?.activeSeconds = max(0, Int(now.timeIntervalSince(currentSession!.startedAt)))

        } else if !isAIEvent && isInAISession {
            // Non-AI foreground — end session
            let flushed = flushCurrentSession(at: now)
            completedSessions.append(contentsOf: flushed)
            isInAISession = false
            currentSession = nil
        }

        return completedSessions
    }

    // MARK: - Flush Current Session

    /// End the current session and return it (or two sessions if split at midnight).
    func flushCurrentSession(at endTime: Date? = nil) -> [DetectedSession] {
        guard var session = currentSession else { return [] }

        let end = endTime ?? Date()
        session.endedAt = end
        session.activeSeconds = max(0, Int(end.timeIntervalSince(session.startedAt)))

        let startDateStr = localDateFormatter.string(from: session.startedAt)
        let endDateStr = localDateFormatter.string(from: end)

        if startDateStr != endDateStr {
            // Cross-midnight: split into two sessions
            return splitCrossMidnight(session: session, startDateStr: startDateStr, endDateStr: endDateStr, actualEnd: end)
        }

        // Single date — finalize normally
        session.localDate = startDateStr
        session.isNight = isNightHours(session.startedAt) || isNightHours(end)
        session.updatedAt = Date()

        return finalize(session)
    }

    // MARK: - Cross-Midnight Split

    private func splitCrossMidnight(session: DetectedSession, startDateStr: String, endDateStr: String, actualEnd: Date) -> [DetectedSession] {
        // Calculate midnight boundary (00:00:00 of end date in local timezone)
        var calendar = Calendar.current
        calendar.timeZone = timezone
        let endDate = localDateFormatter.date(from: endDateStr)!
        let midnight = calendar.startOfDay(for: endDate)

        let firstSegmentSeconds = max(0, Int(midnight.timeIntervalSince(session.startedAt)))
        let secondSegmentSeconds = max(0, Int(actualEnd.timeIntervalSince(midnight)))

        var results: [DetectedSession] = []

        // First segment (before midnight)
        if firstSegmentSeconds >= 15 {
            var first = session
            first.id = idGenerator() // new ID for the split segment
            first.endedAt = midnight
            first.activeSeconds = firstSegmentSeconds
            first.localDate = startDateStr
            first.isNight = isNightHours(session.startedAt) || isNightHours(midnight.addingTimeInterval(-1))
            first.updatedAt = Date()
            if firstSegmentSeconds < 30 { first.status = .suspected }
            if let finalized = finalizeSingle(first) {
                results.append(finalized)
            }
        }

        // Second segment (after midnight)
        if secondSegmentSeconds >= 15 {
            var second = session
            second.id = idGenerator()
            second.startedAt = midnight
            second.endedAt = actualEnd
            second.activeSeconds = secondSegmentSeconds
            second.localDate = endDateStr
            second.isNight = isNightHours(midnight) || isNightHours(actualEnd)
            second.updatedAt = Date()
            if secondSegmentSeconds < 30 { second.status = .suspected }
            if let finalized = finalizeSingle(second) {
                results.append(finalized)
            }
        }

        // If both segments too short, keep original as one session on start date
        if results.isEmpty {
            var single = session
            single.localDate = startDateStr
            single.isNight = isNightHours(session.startedAt) || isNightHours(actualEnd)
            single.updatedAt = Date()
            if let finalized = finalizeSingle(single) {
                results.append(finalized)
            }
        }

        currentSession = nil
        return results
    }

    // MARK: - Finalize

    /// Apply noise filtering and status assignment. Returns nil if session should be discarded.
    private func finalize(_ session: DetectedSession) -> [DetectedSession] {
        if let result = finalizeSingle(session) {
            return [result]
        }
        return []
    }

    private func finalizeSingle(_ session: DetectedSession) -> DetectedSession? {
        var s = session

        // Discard sessions < 15 seconds
        if s.activeSeconds < 15 {
            return nil
        }

        // Flag 15-30s as suspected
        if s.activeSeconds < 30 {
            s.status = .suspected
        }

        s.updatedAt = Date()
        s.sourceFingerprint = computeFingerprint(session: s)
        return s
    }

    // MARK: - Private Helpers

    private func startNewSession(event: RawEvent, matchResult: ToolMatchResult, at timestamp: Date) {
        let sessionId = idGenerator()
        let now = Date()

        var session = DetectedSession(
            id: sessionId,
            sourcePlatform: event.platform,
            sourceKind: event.platform == .browser ? .web : .app,
            detectorId: "macos.workspace",
            toolId: matchResult.matchedTool?.id,
            toolName: matchResult.matchedTool?.name,
            rawAppName: event.appName,
            rawBundleId: event.bundleId,
            rawPackageName: event.packageName,
            rawDomain: event.domain,
            rawUrlPattern: event.urlPattern,
            windowTitleHash: event.windowTitleHash,
            startedAt: timestamp,
            endedAt: timestamp,
            activeSeconds: 0,
            idleSeconds: 0,
            localDate: localDateFormatter.string(from: timestamp),
            timezone: timezone.identifier,
            isNight: isNightHours(timestamp),
            confidence: matchResult.confidence,
            status: .pending,
            mergedIntoSessionId: nil,
            promptCount: 0,
            deviceId: deviceId,
            sourceSessionId: nil,
            sourceFingerprint: nil,
            syncStatus: .localOnly,
            syncedAt: nil,
            createdAt: now,
            updatedAt: now
        )

        if matchResult.needsConfirmation {
            session.status = .suspected
        }

        currentSession = session
    }

    private func isNightHours(_ date: Date) -> Bool {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.hour], from: date)
        guard let hour = components.hour else { return false }
        return hour >= 22 || hour < 6
    }

    // MARK: - Merge Adjacent Sessions

    func mergeAdjacentSessions(_ sessions: [DetectedSession]) -> [DetectedSession] {
        guard sessions.count > 1 else { return sessions }

        let sorted = sessions.sorted { $0.startedAt < $1.startedAt }
        var merged: [DetectedSession] = []
        var current = sorted[0]

        for i in 1..<sorted.count {
            let next = sorted[i]
            let sameTool = current.toolId == next.toolId
            let gap = next.startedAt.timeIntervalSince(current.endedAt)
            let withinThreshold = gap <= 180 && gap >= 0

            if sameTool && withinThreshold && current.status != .completed && next.status != .completed {
                var updated = current
                updated.endedAt = max(current.endedAt, next.endedAt)
                updated.activeSeconds = Int(updated.endedAt.timeIntervalSince(updated.startedAt))
                updated.updatedAt = Date()
                current = updated
            } else {
                merged.append(current)
                current = next
            }
        }

        merged.append(current)
        return merged
    }

    // MARK: - State

    var hasActiveSession: Bool { currentSession != nil }

    func getCurrentSession() -> DetectedSession? { currentSession }

    func reset() {
        currentSession = nil
        isInAISession = false
        lastEventTime = nil
    }
}
