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
    var deviceId: String
    var sourceSessionId: String?
    var sourceFingerprint: String?
    var syncStatus: SyncStatus
    var syncedAt: Date?
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
        case deviceId = "device_id"
        case sourceSessionId = "source_session_id"
        case sourceFingerprint = "source_fingerprint"
        case syncStatus = "sync_status"
        case syncedAt = "synced_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    /// Custom decoder that provides defaults for new fields added in v2,
    /// so existing detected_sessions.json files without these keys still load.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        sourcePlatform = try container.decode(SourcePlatform.self, forKey: .sourcePlatform)
        sourceKind = try container.decode(SourceKind.self, forKey: .sourceKind)
        detectorId = try container.decode(String.self, forKey: .detectorId)
        toolId = try container.decodeIfPresent(String.self, forKey: .toolId)
        toolName = try container.decodeIfPresent(String.self, forKey: .toolName)
        rawAppName = try container.decodeIfPresent(String.self, forKey: .rawAppName)
        rawBundleId = try container.decodeIfPresent(String.self, forKey: .rawBundleId)
        rawPackageName = try container.decodeIfPresent(String.self, forKey: .rawPackageName)
        rawDomain = try container.decodeIfPresent(String.self, forKey: .rawDomain)
        rawUrlPattern = try container.decodeIfPresent(String.self, forKey: .rawUrlPattern)
        windowTitleHash = try container.decodeIfPresent(String.self, forKey: .windowTitleHash)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        endedAt = try container.decode(Date.self, forKey: .endedAt)
        activeSeconds = try container.decode(Int.self, forKey: .activeSeconds)
        idleSeconds = try container.decodeIfPresent(Int.self, forKey: .idleSeconds) ?? 0
        localDate = try container.decode(String.self, forKey: .localDate)
        timezone = try container.decodeIfPresent(String.self, forKey: .timezone) ?? TimeZone.current.identifier
        isNight = try container.decodeIfPresent(Bool.self, forKey: .isNight) ?? false
        confidence = try container.decode(Double.self, forKey: .confidence)
        status = try container.decode(SessionStatus.self, forKey: .status)
        mergedIntoSessionId = try container.decodeIfPresent(String.self, forKey: .mergedIntoSessionId)
        promptCount = try container.decodeIfPresent(Int.self, forKey: .promptCount) ?? 0
        // v2 fields with backward-compatible defaults
        deviceId = try container.decodeIfPresent(String.self, forKey: .deviceId) ?? ""
        sourceSessionId = try container.decodeIfPresent(String.self, forKey: .sourceSessionId)
        sourceFingerprint = try container.decodeIfPresent(String.self, forKey: .sourceFingerprint)
        syncStatus = try container.decodeIfPresent(SyncStatus.self, forKey: .syncStatus) ?? .localOnly
        syncedAt = try container.decodeIfPresent(Date.self, forKey: .syncedAt)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
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
