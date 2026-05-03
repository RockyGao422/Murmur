import Foundation

struct LedgerEntry: Codable, Identifiable, Equatable {
    var id: String
    var detectedSessionId: String
    var sourcePlatform: SourcePlatform
    var toolId: String
    var toolName: String
    var useCaseId: String
    var useCaseName: String
    var estimatedSavedMinutes: Int
    var promptMinutes: Int
    var reviewMinutes: Int
    var editMinutes: Int
    var debugMinutes: Int
    var reworkMinutes: Int
    var totalExtraCostMinutes: Int
    var netGainMinutes: Int
    var quality: OutputQuality
    var qualityScore: Int
    var qualityPenalty: Int
    var mood: UserMood
    var moodWeight: Int
    var hasRework: Bool
    var note: String?
    var localDate: String
    var timezone: String
    var createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case detectedSessionId = "detected_session_id"
        case sourcePlatform = "source_platform"
        case toolId = "tool_id"
        case toolName = "tool_name"
        case useCaseId = "use_case_id"
        case useCaseName = "use_case_name"
        case estimatedSavedMinutes = "estimated_saved_minutes"
        case promptMinutes = "prompt_minutes"
        case reviewMinutes = "review_minutes"
        case editMinutes = "edit_minutes"
        case debugMinutes = "debug_minutes"
        case reworkMinutes = "rework_minutes"
        case totalExtraCostMinutes = "total_extra_cost_minutes"
        case netGainMinutes = "net_gain_minutes"
        case quality
        case qualityScore = "quality_score"
        case qualityPenalty = "quality_penalty"
        case mood
        case moodWeight = "mood_weight"
        case hasRework = "has_rework"
        case note
        case localDate = "local_date"
        case timezone
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    static func == (lhs: LedgerEntry, rhs: LedgerEntry) -> Bool {
        return lhs.id == rhs.id
    }

    // MARK: - Computed Properties

    var netGainFormatted: String {
        if netGainMinutes >= 0 {
            return "+\(netGainMinutes)分钟"
        } else {
            return "\(netGainMinutes)分钟"
        }
    }

    var netGainIsPositive: Bool {
        return netGainMinutes > 0
    }

    var extraCostFormatted: String {
        return "\(totalExtraCostMinutes)分钟"
    }
}
