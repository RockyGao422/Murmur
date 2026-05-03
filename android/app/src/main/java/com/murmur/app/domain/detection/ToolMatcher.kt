package com.murmur.app.domain.detection

import com.murmur.app.domain.model.*

/**
 * Matches raw usage events to known AI tools in the catalog.
 * Implements the same matching logic as other Murmur platforms.
 */
class ToolMatcher(
    private val tools: List<ToolCatalogItem>,
    private val ignoredTargets: List<String> = emptyList()
) {

    /**
     * Match a raw event to a tool in the catalog.
     * Returns a MatchResult indicating the matched tool, confidence, and whether it needs user confirmation.
     */
    fun match(rawEvent: RawEvent): MatchResult {
        val packageName = rawEvent.packageName

        // Check ignored targets first
        if (isIgnored(packageName)) {
            return MatchResult(
                tool = null,
                confidence = 0.0f,
                matchedRule = "ignored",
                ignored = true,
                needsConfirmation = false
            )
        }

        // Try exact package name match (confidence: 0.98)
        for (tool in tools) {
            if (!tool.detectionEnabled) continue
            if (packageName in tool.androidPackageNames) {
                val confidence = tool.confidencePackageName
                return MatchResult(
                    tool = tool,
                    confidence = confidence,
                    matchedRule = "package_name",
                    ignored = false,
                    needsConfirmation = confidence < 0.6f
                )
            }
        }

        // Fuzzy matching by package name substring
        for (tool in tools) {
            if (!tool.detectionEnabled) continue
            val aliases = tool.aliases.map { it.lowercase() }
            val pkgLower = packageName.lowercase()
            for (alias in aliases) {
                if (alias.length >= 3 && pkgLower.contains(alias)) {
                    return MatchResult(
                        tool = tool,
                        confidence = tool.confidenceAppName * 0.8f,
                        matchedRule = "fuzzy_package",
                        ignored = false,
                        needsConfirmation = true
                    )
                }
            }
        }

        // No match found
        return MatchResult(
            tool = null,
            confidence = 0.0f,
            matchedRule = "",
            ignored = false,
            needsConfirmation = false
        )
    }

    private fun isIgnored(packageName: String): Boolean {
        return ignoredTargets.any { target ->
            packageName.equals(target, ignoreCase = true) ||
            packageName.contains(target, ignoreCase = true)
        }
    }
}
