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

    var completionRate: Double {
        guard totalEntries > 0 || detectedSessionCount > 0 else { return 0 }
        let total = Double(pendingSessionCount + completedSessionCount + ignoredSessionCount)
        return total > 0 ? Double(completedSessionCount) / total : 0
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
