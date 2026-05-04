import Foundation

struct DailySummary: Codable, Identifiable, Equatable {
    var id: String // local_date used as id
    var localDate: String
    var detectedSessionCount: Int
    var pendingSessionCount: Int
    var completedSessionCount: Int
    var ignoredSessionCount: Int
    var suspectedSessionCount: Int
    var detectedActiveSeconds: Int
    var grossActiveSeconds: Int = 0
    var dedupedActiveSeconds: Int = 0
    var appActiveSeconds: Int = 0
    var webActiveSeconds: Int = 0
    var promptCount: Int = 0
    var completionRate: Double = 0
    var distinctToolCount: Int
    var toolSwitchCount: Int
    var nightSessionCount: Int
    var totalEntries: Int
    var totalSavedMinutes: Int
    var totalExtraCostMinutes: Int
    var netGainMinutes: Int
    var totalReworkMinutes: Int
    var reworkRate: Double
    var fatigueScore: Int
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case localDate = "local_date"
        case detectedSessionCount = "detected_session_count"
        case pendingSessionCount = "pending_session_count"
        case completedSessionCount = "completed_session_count"
        case ignoredSessionCount = "ignored_session_count"
        case suspectedSessionCount = "suspected_session_count"
        case detectedActiveSeconds = "detected_active_seconds"
        case grossActiveSeconds = "gross_active_seconds"
        case dedupedActiveSeconds = "deduped_active_seconds"
        case appActiveSeconds = "app_active_seconds"
        case webActiveSeconds = "web_active_seconds"
        case promptCount = "prompt_count"
        case completionRate = "completion_rate"
        case distinctToolCount = "distinct_tool_count"
        case toolSwitchCount = "tool_switch_count"
        case nightSessionCount = "night_session_count"
        case totalEntries = "total_entries"
        case totalSavedMinutes = "total_saved_minutes"
        case totalExtraCostMinutes = "total_extra_cost_minutes"
        case netGainMinutes = "net_gain_minutes"
        case totalReworkMinutes = "total_rework_minutes"
        case reworkRate = "rework_rate"
        case fatigueScore = "fatigue_score"
        case updatedAt = "updated_at"
    }

    /// Custom decoder with defaults for v2 fields so existing daily_summaries.json still loads.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        localDate = try container.decode(String.self, forKey: .localDate)
        detectedSessionCount = try container.decode(Int.self, forKey: .detectedSessionCount)
        pendingSessionCount = try container.decode(Int.self, forKey: .pendingSessionCount)
        completedSessionCount = try container.decode(Int.self, forKey: .completedSessionCount)
        ignoredSessionCount = try container.decodeIfPresent(Int.self, forKey: .ignoredSessionCount) ?? 0
        suspectedSessionCount = try container.decodeIfPresent(Int.self, forKey: .suspectedSessionCount) ?? 0
        detectedActiveSeconds = try container.decode(Int.self, forKey: .detectedActiveSeconds)
        grossActiveSeconds = try container.decodeIfPresent(Int.self, forKey: .grossActiveSeconds) ?? 0
        dedupedActiveSeconds = try container.decodeIfPresent(Int.self, forKey: .dedupedActiveSeconds) ?? 0
        appActiveSeconds = try container.decodeIfPresent(Int.self, forKey: .appActiveSeconds) ?? 0
        webActiveSeconds = try container.decodeIfPresent(Int.self, forKey: .webActiveSeconds) ?? 0
        promptCount = try container.decodeIfPresent(Int.self, forKey: .promptCount) ?? 0
        completionRate = try container.decodeIfPresent(Double.self, forKey: .completionRate) ?? 0
        distinctToolCount = try container.decodeIfPresent(Int.self, forKey: .distinctToolCount) ?? 0
        toolSwitchCount = try container.decodeIfPresent(Int.self, forKey: .toolSwitchCount) ?? 0
        nightSessionCount = try container.decodeIfPresent(Int.self, forKey: .nightSessionCount) ?? 0
        totalEntries = try container.decodeIfPresent(Int.self, forKey: .totalEntries) ?? 0
        totalSavedMinutes = try container.decodeIfPresent(Int.self, forKey: .totalSavedMinutes) ?? 0
        totalExtraCostMinutes = try container.decodeIfPresent(Int.self, forKey: .totalExtraCostMinutes) ?? 0
        netGainMinutes = try container.decodeIfPresent(Int.self, forKey: .netGainMinutes) ?? 0
        totalReworkMinutes = try container.decodeIfPresent(Int.self, forKey: .totalReworkMinutes) ?? 0
        reworkRate = try container.decodeIfPresent(Double.self, forKey: .reworkRate) ?? 0
        fatigueScore = try container.decodeIfPresent(Int.self, forKey: .fatigueScore) ?? 0
        updatedAt = try container.decodeIfPresent(Date.self, forKey: .updatedAt) ?? Date()
    }

    /// Memberwise initializer (must be explicit since custom Decodable init removes synthesis).
    init(
        id: String, localDate: String, detectedSessionCount: Int, pendingSessionCount: Int,
        completedSessionCount: Int, ignoredSessionCount: Int = 0, suspectedSessionCount: Int = 0,
        detectedActiveSeconds: Int, grossActiveSeconds: Int = 0, dedupedActiveSeconds: Int = 0,
        appActiveSeconds: Int = 0, webActiveSeconds: Int = 0, promptCount: Int = 0,
        completionRate: Double = 0, distinctToolCount: Int = 0, toolSwitchCount: Int = 0,
        nightSessionCount: Int = 0, totalEntries: Int = 0, totalSavedMinutes: Int = 0,
        totalExtraCostMinutes: Int = 0, netGainMinutes: Int = 0, totalReworkMinutes: Int = 0,
        reworkRate: Double = 0, fatigueScore: Int = 0, updatedAt: Date = Date()
    ) {
        self.id = id
        self.localDate = localDate
        self.detectedSessionCount = detectedSessionCount
        self.pendingSessionCount = pendingSessionCount
        self.completedSessionCount = completedSessionCount
        self.ignoredSessionCount = ignoredSessionCount
        self.suspectedSessionCount = suspectedSessionCount
        self.detectedActiveSeconds = detectedActiveSeconds
        self.grossActiveSeconds = grossActiveSeconds
        self.dedupedActiveSeconds = dedupedActiveSeconds
        self.appActiveSeconds = appActiveSeconds
        self.webActiveSeconds = webActiveSeconds
        self.promptCount = promptCount
        self.completionRate = completionRate
        self.distinctToolCount = distinctToolCount
        self.toolSwitchCount = toolSwitchCount
        self.nightSessionCount = nightSessionCount
        self.totalEntries = totalEntries
        self.totalSavedMinutes = totalSavedMinutes
        self.totalExtraCostMinutes = totalExtraCostMinutes
        self.netGainMinutes = netGainMinutes
        self.totalReworkMinutes = totalReworkMinutes
        self.reworkRate = reworkRate
        self.fatigueScore = fatigueScore
        self.updatedAt = updatedAt
    }

    static func == (lhs: DailySummary, rhs: DailySummary) -> Bool {
        return lhs.id == rhs.id
    }

    var detectedActiveMinutes: Int {
        return detectedActiveSeconds / 60
    }

    var detectedActiveMinutesFormatted: String {
        let minutes = detectedActiveMinutes
        if minutes >= 60 {
            let h = minutes / 60
            let m = minutes % 60
            return "\(h)时\(m)分"
        }
        return "\(minutes)分钟"
    }

    var completionRatePercent: String {
        return String(format: "%.0f%%", completionRate * 100)
    }

    var netGainFormatted: String {
        if netGainMinutes >= 0 {
            return "+\(netGainMinutes)分钟"
        } else {
            return "\(netGainMinutes)分钟"
        }
    }
}
