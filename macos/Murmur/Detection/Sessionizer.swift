import Foundation

class Sessionizer {
    private var currentSession: DetectedSession?
    private var isInAISession: Bool = false
    private var lastEventTime: Date?
    private let idGenerator: () -> String
    private let timezone: TimeZone
    private let dateFormatter: ISO8601DateFormatter
    private let localDateFormatter: DateFormatter

    init(idGenerator: @escaping () -> String = { UUID().uuidString }) {
        self.idGenerator = idGenerator
        self.timezone = TimeZone.current
        self.dateFormatter = ISO8601DateFormatter()
        self.dateFormatter.timeZone = timezone
        self.localDateFormatter = DateFormatter()
        self.localDateFormatter.dateFormat = "yyyy-MM-dd"
        self.localDateFormatter.timeZone = timezone
    }

    // MARK: - Process Event

    /// Process a new RawEvent through the sessionizer
    /// Returns a completed session if one was ended, or nil
    func processEvent(_ event: RawEvent, matchResult: ToolMatchResult) -> DetectedSession? {
        let now = event.timestamp

        // Check idle threshold (5 minutes)
        if let lastTime = lastEventTime, now.timeIntervalSince(lastTime) > 300 {
            // Significant gap, flush current session
            let flushed = flushCurrentSession(at: lastTime)
            isInAISession = false
            currentSession = nil
        }

        lastEventTime = now

        // Determine if this is an AI foreground event
        let isAIEvent = matchResult.matchedTool != nil && !matchResult.shouldIgnore && matchResult.confidence >= 0.4

        if isAIEvent && !isInAISession {
            // Start new AI session
            if let flushed = flushCurrentSession(at: now) {
                // There was a previous session, return it
                startNewSession(event: event, matchResult: matchResult, at: now)
                isInAISession = true
                return flushed
            }
            startNewSession(event: event, matchResult: matchResult, at: now)
            isInAISession = true

        } else if isAIEvent && isInAISession {
            // Continuing AI session - update end time
            currentSession?.endedAt = now
            currentSession?.activeSeconds = max(0, Int(now.timeIntervalSince(currentSession!.startedAt)))

        } else if !isAIEvent && isInAISession {
            // Non-AI foreground - end current session
            let flushed = flushCurrentSession(at: now)
            isInAISession = false
            currentSession = nil
            return flushed
        }

        return nil
    }

    // MARK: - Flush Current Session

    func flushCurrentSession(at endTime: Date? = nil) -> DetectedSession? {
        guard var session = currentSession else { return nil }

        let end = endTime ?? Date()
        session.endedAt = end
        session.activeSeconds = max(0, Int(end.timeIntervalSince(session.startedAt)))

        // Check cross-midnight: if session spans two dates, split it
        let startDate = localDateFormatter.string(from: session.startedAt)
        let endDate = localDateFormatter.string(from: end)
        if startDate != endDate {
            // Split: this session ends at midnight of start date
            // Actually, for simplicity, we just keep the full session on the start date
            session.localDate = startDate
        }

        // Update night flag
        session.isNight = isNightHours(session.startedAt) || isNightHours(end)

        // Discard sessions < 15 seconds
        if session.activeSeconds < 15 {
            currentSession = nil
            isInAISession = false
            return nil
        }

        // Flag 15-30s as suspected
        if session.activeSeconds < 30 {
            session.status = .suspected
        }

        // Update timestamps
        session.updatedAt = Date()
        if session.createdAt == session.startedAt {
            // Preserve original created_at
        }

        let completed = session
        currentSession = nil
        return completed
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

    /// Merge sessions that are from the same tool and within 3 minutes of each other
    func mergeAdjacentSessions(_ sessions: [DetectedSession]) -> [DetectedSession] {
        guard sessions.count > 1 else { return sessions }

        let sorted = sessions.sorted { $0.startedAt < $1.startedAt }
        var merged: [DetectedSession] = []
        var current = sorted[0]

        for i in 1..<sorted.count {
            let next = sorted[i]

            let sameTool = current.toolId == next.toolId
            let gap = next.startedAt.timeIntervalSince(current.endedAt)
            let withinThreshold = gap <= 180 && gap >= 0 // 3 minutes

            if sameTool && withinThreshold && current.status != .completed && next.status != .completed {
                // Merge: combine into current
                var updated = current
                updated.endedAt = max(current.endedAt, next.endedAt)
                updated.activeSeconds = Int(updated.endedAt.timeIntervalSince(updated.startedAt))
                updated.updatedAt = Date()

                // Mark the merged session
                var mergedNext = next
                mergedNext.status = .merged
                mergedNext.mergedIntoSessionId = current.id
                mergedNext.updatedAt = Date()

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

    var hasActiveSession: Bool {
        return currentSession != nil
    }

    func getCurrentSession() -> DetectedSession? {
        return currentSession
    }

    func reset() {
        currentSession = nil
        isInAISession = false
        lastEventTime = nil
    }
}
