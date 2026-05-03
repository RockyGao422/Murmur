import Foundation
import Combine

@MainActor
class ToolsViewModel: ObservableObject {
    private let storageManager: StorageManager

    @Published var tools: [ToolCatalogItem] = []
    @Published var enabledTools: [ToolCatalogItem] = []
    @Published var disabledTools: [ToolCatalogItem] = []
    @Published var searchQuery: String = ""
    @Published var isLoading: Bool = false
    @Published var toolDetectionCounts: [String: Int] = [:]

    init(storageManager: StorageManager) {
        self.storageManager = storageManager
    }

    func loadTools() {
        isLoading = true

        tools = storageManager.loadToolCatalog()
        enabledTools = tools.filter { $0.detectionEnabled }.sorted { $0.sortOrder < $1.sortOrder }
        disabledTools = tools.filter { !$0.detectionEnabled }.sorted { $0.sortOrder < $1.sortOrder }

        // Compute detection counts from sessions
        let sessions = storageManager.loadSessions()
        let counts = Dictionary(grouping: sessions, by: { $0.toolId ?? "unknown" })
            .mapValues { $0.count }
        toolDetectionCounts = counts

        isLoading = false
    }

    var filteredTools: [ToolCatalogItem] {
        if searchQuery.isEmpty {
            return tools.sorted { $0.sortOrder < $1.sortOrder }
        }
        let query = searchQuery.lowercased()
        return tools.filter {
            $0.name.lowercased().contains(query) ||
            $0.aliases.contains { $0.lowercased().contains(query) } ||
            $0.macosBundleIds.contains { $0.lowercased().contains(query) }
        }.sorted { $0.sortOrder < $1.sortOrder }
    }

    func toggleTool(_ tool: ToolCatalogItem) {
        guard let index = tools.firstIndex(where: { $0.id == tool.id }) else { return }
        var updated = tools[index]
        updated.detectionEnabled.toggle()
        tools[index] = updated
        storageManager.saveToolCatalog(tools)
        loadTools()
    }

    func addTool(name: String, bundleIds: [String], appNames: [String], titlePatterns: [String]) -> ToolCatalogItem {
        let maxOrder = tools.map { $0.sortOrder }.max() ?? 0
        let newTool = ToolCatalogItem(
            id: "custom_\(UUID().uuidString.prefix(8))",
            name: name,
            aliases: [name],
            macosBundleIds: bundleIds,
            macosAppNamePatterns: appNames,
            macosTitlePatterns: titlePatterns,
            androidPackageNames: [],
            webDomains: [],
            urlPatterns: [],
            defaultEnabled: true,
            detectionEnabled: true,
            isDefault: false,
            userDefined: true,
            sortOrder: maxOrder + 1,
            confidence: ToolConfidence()
        )
        var updated = tools
        updated.append(newTool)
        tools = updated
        storageManager.saveToolCatalog(tools)
        loadTools()
        return newTool
    }

    func updateToolRules(toolId: String, bundleIds: [String]?, appNames: [String]?, titlePatterns: [String]?) {
        guard let index = tools.firstIndex(where: { $0.id == toolId }) else { return }
        var updated = tools[index]
        if let bundleIds = bundleIds { updated.macosBundleIds = bundleIds }
        if let appNames = appNames { updated.macosAppNamePatterns = appNames }
        if let titlePatterns = titlePatterns { updated.macosTitlePatterns = titlePatterns }
        tools[index] = updated
        storageManager.saveToolCatalog(tools)
        loadTools()
    }

    func addIgnoredTarget(type: String, value: String, displayValue: String, reason: String?) {
        let targets = storageManager.loadIgnoredTargets()

        // Hash the value for privacy
        let matcher = ToolMatcher()
        let valueHash = matcher.hashValue(value)

        let newTarget = IgnoredTarget(
            id: UUID().uuidString,
            targetType: type,
            targetValueHash: valueHash,
            displayValue: displayValue,
            sourcePlatform: .macos,
            reason: reason,
            createdAt: Date()
        )

        var updated = targets
        updated.append(newTarget)
        storageManager.saveIgnoredTargets(updated)
    }

    func removeIgnoredTarget(_ target: IgnoredTarget) {
        var targets = storageManager.loadIgnoredTargets()
        targets.removeAll { $0.id == target.id }
        storageManager.saveIgnoredTargets(targets)
    }

    func getDetectionCount(for toolId: String) -> Int {
        return toolDetectionCounts[toolId] ?? 0
    }

    func getDetectionCount(for tool: ToolCatalogItem) -> Int {
        return toolDetectionCounts[tool.id] ?? 0
    }
}
