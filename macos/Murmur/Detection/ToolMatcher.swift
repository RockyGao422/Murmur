import Foundation
import CryptoKit

class ToolMatcher {
    private var toolCatalog: [ToolCatalogItem] = []
    private var ignoredTargets: [IgnoredTarget] = []

    func updateCatalog(_ tools: [ToolCatalogItem]) {
        toolCatalog = tools
    }

    var catalogCount: Int { toolCatalog.count }

    func updateIgnoredTargets(_ targets: [IgnoredTarget]) {
        ignoredTargets = targets
    }

    /// Match a RawEvent to a tool in the catalog
    /// Matching priority:
    /// 1) Check ignored targets
    /// 2) Bundle ID match (0.98)
    /// 3) App name exact match (0.85)
    /// 4) Window title pattern (0.65)
    /// 5) Fuzzy match (0.4-0.6)
    func match(event: RawEvent) -> ToolMatchResult {
        // Step 1: Check if this event should be ignored
        if let bundleId = event.bundleId, isIgnored(bundleId, type: "bundle_id") {
            return ToolMatchResult(matchedTool: nil, confidence: 0, shouldIgnore: true, needsConfirmation: false, matchMethod: nil)
        }
        if let appName = event.appName, isIgnored(appName, type: "app_name") {
            return ToolMatchResult(matchedTool: nil, confidence: 0, shouldIgnore: true, needsConfirmation: false, matchMethod: nil)
        }
        if let domain = event.domain, isIgnored(domain, type: "domain") {
            return ToolMatchResult(matchedTool: nil, confidence: 0, shouldIgnore: true, needsConfirmation: false, matchMethod: nil)
        }

        // Only process foreground events
        guard event.eventType == .foreground else {
            return ToolMatchResult(matchedTool: nil, confidence: 0, shouldIgnore: false, needsConfirmation: false, matchMethod: nil)
        }

        var bestMatch: (tool: ToolCatalogItem, confidence: Double, method: String)?

        for tool in toolCatalog {
            guard tool.detectionEnabled else { continue }

            // Priority 2: Bundle ID exact match
            if let bundleId = event.bundleId, let match = matchBundleId(bundleId, tool: tool) {
                if bestMatch == nil || match.confidence > bestMatch!.confidence {
                    bestMatch = match
                }
                continue
            }

            // Priority 3: App name exact match
            if let appName = event.appName, let match = matchAppName(appName, tool: tool) {
                if bestMatch == nil || match.confidence > bestMatch!.confidence {
                    bestMatch = match
                }
                continue
            }

            // Priority 4: Window title pattern match
            if let title = event.windowTitle, let match = matchWindowTitle(title, tool: tool) {
                if bestMatch == nil || match.confidence > bestMatch!.confidence {
                    bestMatch = match
                }
                continue
            }

            // Priority 5: Fuzzy match (app name similarity)
            if let appName = event.appName, let match = fuzzyMatch(appName, tool: tool) {
                if bestMatch == nil || match.confidence > bestMatch!.confidence {
                    bestMatch = match
                }
            }
        }

        if let best = bestMatch {
            let needsConfirmation = best.confidence < 0.7
            return ToolMatchResult(
                matchedTool: best.tool,
                confidence: best.confidence,
                shouldIgnore: false,
                needsConfirmation: needsConfirmation,
                matchMethod: best.method
            )
        }

        return ToolMatchResult(matchedTool: nil, confidence: 0, shouldIgnore: false, needsConfirmation: false, matchMethod: nil)
    }

    // MARK: - Match Methods

    private func matchBundleId(_ bundleId: String, tool: ToolCatalogItem) -> (tool: ToolCatalogItem, confidence: Double, method: String)? {
        if tool.macosBundleIds.contains(bundleId) {
            return (tool, tool.confidence.bundleId, "bundle_id")
        }
        return nil
    }

    private func matchAppName(_ appName: String, tool: ToolCatalogItem) -> (tool: ToolCatalogItem, confidence: Double, method: String)? {
        let normalizedAppName = appName.lowercased().trimmingCharacters(in: .whitespaces)
        for pattern in tool.macosAppNamePatterns {
            let normalizedPattern = pattern.lowercased().trimmingCharacters(in: .whitespaces)
            if normalizedAppName == normalizedPattern {
                return (tool, tool.confidence.appName, "app_name")
            }
        }
        return nil
    }

    private func matchWindowTitle(_ title: String, tool: ToolCatalogItem) -> (tool: ToolCatalogItem, confidence: Double, method: String)? {
        let normalizedTitle = title.lowercased().trimmingCharacters(in: .whitespaces)
        for pattern in tool.macosTitlePatterns {
            let normalizedPattern = pattern.lowercased().trimmingCharacters(in: .whitespaces)
            if normalizedTitle.contains(normalizedPattern) {
                return (tool, tool.confidence.title, "title")
            }
        }
        return nil
    }

    private func fuzzyMatch(_ appName: String, tool: ToolCatalogItem) -> (tool: ToolCatalogItem, confidence: Double, method: String)? {
        let normalizedAppName = appName.lowercased().trimmingCharacters(in: .whitespaces)
        var bestScore: Double = 0

        for alias in tool.aliases {
            let normalizedAlias = alias.lowercased().trimmingCharacters(in: .whitespaces)
            let score = stringSimilarity(normalizedAppName, normalizedAlias)
            if score > bestScore {
                bestScore = score
            }
        }

        if bestScore > 0.7 {
            let confidence = 0.4 + (bestScore - 0.7) * 0.6 / 0.3 // Map 0.7-1.0 to 0.4-0.6
            return (tool, confidence, "fuzzy")
        }

        return nil
    }

    // MARK: - Ignored Targets Check

    private func isIgnored(_ value: String, type: String) -> Bool {
        let hash = hashValue(value)
        return ignoredTargets.contains { $0.targetType == type && $0.targetValueHash == hash }
    }

    func hashValue(_ value: String) -> String {
        guard let data = value.data(using: .utf8) else { return "" }
        return SHA256.hash(data: data).compactMap { String(format: "%02x", $0) }.joined()
    }

    // MARK: - String Similarity (Levenshtein-based)

    private func stringSimilarity(_ s1: String, _ s2: String) -> Double {
        if s1 == s2 { return 1.0 }
        if s1.isEmpty || s2.isEmpty { return 0.0 }
        if s1.contains(s2) || s2.contains(s1) { return 0.8 }

        let dist = levenshteinDistance(s1, s2)
        let maxLen = max(s1.count, s2.count)
        return 1.0 - Double(dist) / Double(maxLen)
    }

    private func levenshteinDistance(_ s1: String, _ s2: String) -> Int {
        let a = Array(s1)
        let b = Array(s2)
        var dp = [[Int]](repeating: [Int](repeating: 0, count: b.count + 1), count: a.count + 1)

        for i in 0...a.count { dp[i][0] = i }
        for j in 0...b.count { dp[0][j] = j }

        for i in 1...a.count {
            for j in 1...b.count {
                dp[i][j] = a[i-1] == b[j-1] ? dp[i-1][j-1] : min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1
            }
        }

        return dp[a.count][b.count]
    }
}
