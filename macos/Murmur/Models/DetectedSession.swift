import Foundation

struct DetectedSession: Codable, Identifiable, Equatable {
    var id: String
    var sourcePlatform: SourcePlatform
    var sourceKind: SourceKind
    var detectorId: String
    var toolId: String?
    var toolName: String?
    var rawAppName: String?
    var rawBundleId: String?
    var rawPackageName: String?
    var rawDomain: String?
    var rawUrlPattern: String?
    var windowTitleHash: String?
    var startedAt: Date
    var endedAt: Date
    var activeSeconds: Int
    var idleSeconds: Int
    var localDate: String
    var timezone: String
    var isNight: Bool
    var confidence: Double
    var status: SessionStatus
    var mergedIntoSessionId: String?
    var promptCount: Int
    var createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case sourcePlatform = "source_platform"
        case sourceKind = "source_kind"
        case detectorId = "detector_id"
        case toolId = "tool_id"
        case toolName = "tool_name"
        case rawAppName = "raw_app_name"
        case rawBundleId = "raw_bundle_id"
        case rawPackageName = "raw_package_name"
        case rawDomain = "raw_domain"
        case rawUrlPattern = "raw_url_pattern"
        case windowTitleHash = "window_title_hash"
        case startedAt = "started_at"
        case endedAt = "ended_at"
        case activeSeconds = "active_seconds"
        case idleSeconds = "idle_seconds"
        case localDate = "local_date"
        case timezone
        case isNight = "is_night"
        case confidence
        case status
        case mergedIntoSessionId = "merged_into_session_id"
        case promptCount = "prompt_count"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    static func == (lhs: DetectedSession, rhs: DetectedSession) -> Bool {
        return lhs.id == rhs.id
    }

    // MARK: - Computed Properties

    var durationFormatted: String {
        let hours = activeSeconds / 3600
        let minutes = (activeSeconds % 3600) / 60
        let seconds = activeSeconds % 60
        if hours > 0 {
            return String(format: "%d时%d分%d秒", hours, minutes, seconds)
        } else if minutes > 0 {
            return String(format: "%d分%d秒", minutes, seconds)
        } else {
            return String(format: "%d秒", seconds)
        }
    }

    var durationShortFormatted: String {
        let minutes = activeSeconds / 60
        if minutes >= 60 {
            let h = minutes / 60
            let m = minutes % 60
            return "\(h)h \(m)m"
        }
        return "\(max(1, minutes))m"
    }

    var isPending: Bool {
        return status == .pending
    }

    var isCompleted: Bool {
        return status == .completed
    }

    var isLowConfidence: Bool {
        return confidence < 0.7
    }

    var isMediumConfidence: Bool {
        return confidence >= 0.7 && confidence < 0.9
    }

    var isHighConfidence: Bool {
        return confidence >= 0.9
    }

    var timeRangeFormatted: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return "\(formatter.string(from: startedAt)) - \(formatter.string(from: endedAt))"
    }
}
