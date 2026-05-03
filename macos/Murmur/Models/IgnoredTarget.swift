import Foundation

struct IgnoredTarget: Codable, Identifiable, Equatable {
    var id: String
    var targetType: String // "bundle_id", "app_name", "domain", "url_pattern"
    var targetValueHash: String // SHA256 hash of the target value (privacy)
    var displayValue: String // User-friendly display (e.g., "com.example.app" or "Example App")
    var sourcePlatform: SourcePlatform?
    var reason: String?
    var createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case targetType = "target_type"
        case targetValueHash = "target_value_hash"
        case displayValue = "display_value"
        case sourcePlatform = "source_platform"
        case reason
        case createdAt = "created_at"
    }

    static func == (lhs: IgnoredTarget, rhs: IgnoredTarget) -> Bool {
        return lhs.id == rhs.id
    }
}
