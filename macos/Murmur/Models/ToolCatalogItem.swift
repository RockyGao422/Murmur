import Foundation

struct ToolConfidence: Codable, Equatable {
    var bundleId: Double = 0.98
    var packageName: Double = 0.98
    var domain: Double = 0.95
    var urlPattern: Double = 0.90
    var appName: Double = 0.85
    var title: Double = 0.65
    var userMapping: Double = 1.0

    enum CodingKeys: String, CodingKey {
        case bundleId = "bundle_id"
        case packageName = "package_name"
        case domain
        case urlPattern = "url_pattern"
        case appName = "app_name"
        case title
        case userMapping = "user_mapping"
    }
}

struct ToolCatalogItem: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var aliases: [String]
    var macosBundleIds: [String]
    var macosAppNamePatterns: [String]
    var macosTitlePatterns: [String]
    var androidPackageNames: [String]
    var webDomains: [String]
    var urlPatterns: [String]
    var defaultEnabled: Bool
    var detectionEnabled: Bool
    var isDefault: Bool
    var userDefined: Bool
    var sortOrder: Int
    var confidence: ToolConfidence

    enum CodingKeys: String, CodingKey {
        case id, name, aliases
        case macosBundleIds = "macos_bundle_ids"
        case macosAppNamePatterns = "macos_app_name_patterns"
        case macosTitlePatterns = "macos_title_patterns"
        case androidPackageNames = "android_package_names"
        case webDomains = "web_domains"
        case urlPatterns = "url_patterns"
        case defaultEnabled = "default_enabled"
        case detectionEnabled = "detection_enabled"
        case isDefault = "is_default"
        case userDefined = "user_defined"
        case sortOrder = "sort_order"
        case confidence
    }

    static func == (lhs: ToolCatalogItem, rhs: ToolCatalogItem) -> Bool {
        return lhs.id == rhs.id
    }
}

// MARK: - Tool Catalog Wrapper (for JSON file format)

struct ToolCatalog: Codable {
    let version: String
    var updatedAt: String
    let description: String
    var tools: [ToolCatalogItem]

    enum CodingKeys: String, CodingKey {
        case version
        case updatedAt = "updated_at"
        case description
        case tools
    }
}

// MARK: - Raw Event (before matching)

struct RawEvent: Codable {
    let eventId: String
    let platform: SourcePlatform
    let eventType: EventType
    let timestamp: Date
    let appName: String?
    let bundleId: String?
    let packageName: String?
    let domain: String?
    let urlPattern: String?
    let windowTitle: String?
    let windowTitleHash: String?
    let tabId: Int?
    let windowId: Int?

    enum CodingKeys: String, CodingKey {
        case eventId = "event_id"
        case platform
        case eventType = "event_type"
        case timestamp
        case appName = "app_name"
        case bundleId = "bundle_id"
        case packageName = "package_name"
        case domain
        case urlPattern = "url_pattern"
        case windowTitle = "window_title"
        case windowTitleHash = "window_title_hash"
        case tabId = "tab_id"
        case windowId = "window_id"
    }
}

// MARK: - Tool Match Result

struct ToolMatchResult {
    let matchedTool: ToolCatalogItem?
    let confidence: Double
    let shouldIgnore: Bool
    let needsConfirmation: Bool
    let matchMethod: String?
}
