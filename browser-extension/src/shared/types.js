/**
 * @fileoverview JSDoc type definitions for Murmur Browser Extension.
 * This file serves as documentation for the data structures used throughout.
 * No runtime code — only JSDoc typedefs.
 *
 * @typedef {'browser-chatgpt'|'browser-claude'|'browser-gemini'|'browser-copilot'|
 *           'browser-deepseek'|'browser-doubao'|'browser-kimi'|'browser-tongyi'|
 *           'browser-wenxin'|'browser-xunfei'|'browser-metaso'|'browser-yuanbao'|
 *           'browser-perplexity'|'browser-poe'|'browser-midjourney'|
 *           'browser-codex'|'browser-unknown'} SourcePlatform
 */

/**
 * @typedef {'creative'|'analytical'|'debugging'|'conversational'|'mixed'} SourceKind
 */

/**
 * @typedef {'completed'|'paused'|'abandoned'|'suspected-abandoned'|
 *           'needs-completion'|'ignored'|'merged'} SessionStatus
 */

/**
 * @typedef {'excellent'|'good'|'neutral'|'maybe-prompted'|'prompted'} OutputQuality
 */

/**
 * @typedef {'great'|'neutral'|'frustrated'|'tired'|'rushed'} UserMood
 */

/**
 * @typedef {'confirmed'|'auto'|'fuzzy'|'user-mapped'} DetectionStatus
 */

/**
 * @typedef {Object} DetectedSession
 * @property {string} id — UUID
 * @property {string} toolId — e.g. 'chatgpt', 'claude'
 * @property {string} toolName — e.g. 'ChatGPT', 'Claude'
 * @property {string} domain — normalized hostname
 * @property {string} url — hostname + path only (no query, no hash)
 * @property {number} startTime — epoch ms
 * @property {number|null} endTime — epoch ms, null if active
 * @property {number} duration — seconds
 * @property {number|null} promptCount — from content script, nullable
 * @property {SessionStatus} status
 * @property {SourcePlatform} source
 * @property {DetectionStatus} detectionStatus
 * @property {number} confidence — 0-1
 * @property {string[]} tags
 * @property {string|null} notes — user notes
 * @property {number} createdAt — epoch ms
 * @property {number} updatedAt — epoch ms
 */

/**
 * @typedef {Object} LedgerEntry
 * @property {string} id — UUID
 * @property {string} sessionId — FK to DetectedSession
 * @property {string} toolId
 * @property {string} toolName
 * @property {number} duration — seconds
 * @property {number|null} qualityScore — 0-100, null if not rated
 * @property {number} qualityPenalty — 0-25, penalty deducted for prompted/rework
 * @property {number|null} extraCostFraction — 0-1, fraction of time spent reworking AI output
 * @property {number|null} netGain — hours gained (duration × (1 - extraCostFraction))
 * @property {number|null} moodWeight — 0.7-1.3 multiplier for mood
 * @property {UserMood|null} mood
 * @property {OutputQuality|null} outputQuality
 * @property {SourceKind} sourceKind
 * @property {boolean} hasRework — true if rework detected
 * @property {string|null} summary — auto-generated or user-provided summary
 * @property {number|null} promptCount
 * @property {number} createdAt — epoch ms
 * @property {number} updatedAt — epoch ms
 */

/**
 * @typedef {Object} ToolCatalogItem
 * @property {string} id
 * @property {string} name
 * @property {string[]} aliases
 * @property {string[]} web_domains
 * @property {string[]} url_patterns
 * @property {boolean} default_enabled
 * @property {boolean} detection_enabled
 * @property {boolean} is_default
 * @property {boolean} user_defined
 * @property {number} sort_order
 * @property {{bundle_id: number, package_name: number, domain: number,
 *             url_pattern: number, app_name: number, title: number,
 *             user_mapping: number}} confidence
 */

/**
 * @typedef {Object} RawEvent
 * @property {string} id — UUID
 * @property {string} eventType — 'tab-activated'|'tab-updated'|'tab-removed'|
 *                               'window-focus-changed'|'navigation-committed'|
 *                               'idle-state-changed'
 * @property {number} timestamp — epoch ms
 * @property {number|null} tabId
 * @property {number|null} windowId
 * @property {string|null} url
 * @property {string|null} domain
 * @property {string|null} title
 * @property {boolean} isIncognito
 * @property {Object|null} metadata
 */

/**
 * @typedef {Object} DailySummary
 * @property {string} id — date string 'YYYY-MM-DD'
 * @property {number} totalDuration — seconds
 * @property {number} sessionCount
 * @property {number} entryCount
 * @property {number} pendingCount — sessions needing completion
 * @property {Object<string, number>} toolDistribution — toolId → duration seconds
 * @property {number} avgQualityScore — 0-100
 * @property {number} totalNetGain — hours
 * @property {number} fatigueScore — 0-100
 * @property {number} createdAt — epoch ms
 * @property {number} updatedAt — epoch ms
 */

/**
 * @typedef {Object} IgnoredTarget
 * @property {string} domain
 * @property {number} addedAt — epoch ms
 */

/**
 * @typedef {Object} MatchResult
 * @property {ToolCatalogItem|null} tool
 * @property {number} confidence
 * @property {string|null} matchedRule
 * @property {boolean} shouldIgnore
 * @property {boolean} needsConfirmation
 */

/**
 * @typedef {Object} MurmurSettings
 * @property {Object<string, {enabled: boolean}>} toolState — toolId → {enabled}
 * @property {string[]} customDomains — user-added AI domains
 * @property {boolean} promptCountingEnabled
 * @property {boolean} idleDetectionEnabled
 * @property {number} idleThresholdMinutes — default 3
 * @property {number} minSessionSeconds — minimum duration, default 15
 * @property {number} suspectedThresholdSeconds — default 30
 * @property {number} mergeWindowMinutes — default 3
 * @property {boolean} debugMode
 */

/**
 * @typedef {Object} WeeklyReview
 * @property {string} weekStart — 'YYYY-MM-DD'
 * @property {string} weekEnd — 'YYYY-MM-DD'
 * @property {number} totalSessions
 * @property {number} totalEntries
 * @property {number} totalDuration — seconds
 * @property {number} totalNetGain — hours
 * @property {number} avgQualityScore — 0-100
 * @property {number} fatigueScore — 0-100
 * @property {{toolId: string, toolName: string, sessions: number,
 *             duration: number}[]} highFrequencyTools
 * @property {{from: string, to: string, count: number}[]} highSwitchPairs
 * @property {number} pendingBacklog
 * @property {{session: DetectedSession, entry: LedgerEntry}|null} bestUseCase
 * @property {{session: DetectedSession, entry: LedgerEntry}|null} worstUseCase
 * @property {string[]} insights
 * @property {number} generatedAt — epoch ms
 */

/**
 * @typedef {Object} DraftEntry
 * @property {string} sessionId
 * @property {string} toolId
 * @property {string} toolName
 * @property {number} duration — seconds
 * @property {OutputQuality|null} outputQuality
 * @property {number|null} extraCostFraction — 0-1
 * @property {UserMood|null} mood
 * @property {SourceKind} sourceKind
 * @property {boolean} hasRework
 * @property {number|null} promptCount
 * @property {string|null} summary
 */

// Prevent module from being empty
const _typesPlaceholder = true;
if (typeof globalThis !== 'undefined') {
  globalThis.__murmur_types__ = _typesPlaceholder;
}
