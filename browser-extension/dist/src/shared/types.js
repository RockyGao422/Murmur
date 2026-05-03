/**
 * @fileoverview JSDoc type definitions aligned with shared/schemas/.
 * DetectedSession matches detected-session.schema.json.
 * LedgerEntry matches ledger-entry.schema.json.
 */

/**
 * @typedef {'macos'|'android'|'browser'} SourcePlatform
 */

/**
 * @typedef {'app'|'web'} SourceKind
 */

/**
 * @typedef {'pending'|'completed'|'ignored'|'merged'|'suspected'} SessionStatus
 */

/**
 * @typedef {'direct_use'|'minor_edit'|'major_edit'|'useless'} OutputQuality
 */

/**
 * @typedef {'easy'|'neutral'|'irritated'|'tired'|'anxious'} UserMood
 */

/**
 * @typedef {Object} DetectedSession
 * @property {string} id — UUID
 * @property {SourcePlatform} sourcePlatform
 * @property {SourceKind} sourceKind
 * @property {string} detectorId — e.g. 'browser.tabs'
 * @property {string} toolId — e.g. 'chatgpt'
 * @property {string} toolName — snapshot
 * @property {string} [rawAppName]
 * @property {string} [rawBundleId]
 * @property {string} [rawPackageName]
 * @property {string} rawDomain — hostname only, no query/fragment
 * @property {string} [rawUrlPattern] — e.g. 'chat.openai.com/*', never full URL
 * @property {string} [windowTitleHash]
 * @property {string} startedAt — ISO 8601
 * @property {string} endedAt — ISO 8601
 * @property {number} activeSeconds
 * @property {number} [idleSeconds]
 * @property {string} localDate — YYYY-MM-DD
 * @property {string} timezone
 * @property {boolean} isNight
 * @property {number} confidence — 0-1
 * @property {SessionStatus} status
 * @property {string} [mergedIntoSessionId]
 * @property {number} [promptCount] — P1, only when enabled
 * @property {string} createdAt — ISO 8601
 * @property {string} updatedAt — ISO 8601
 */

/**
 * @typedef {Object} LedgerEntry
 * @property {string} id — UUID
 * @property {string} detectedSessionId — FK to DetectedSession
 * @property {SourcePlatform} sourcePlatform
 * @property {string} toolId
 * @property {string} toolName
 * @property {string} useCaseId
 * @property {string} useCaseName
 * @property {number} estimatedSavedMinutes
 * @property {number} promptMinutes
 * @property {number} reviewMinutes
 * @property {number} editMinutes
 * @property {number} debugMinutes
 * @property {number} reworkMinutes
 * @property {number} totalExtraCostMinutes
 * @property {number} netGainMinutes
 * @property {OutputQuality} quality
 * @property {number} qualityScore — 1-4
 * @property {number} qualityPenalty — 0/4/9/14
 * @property {UserMood} mood
 * @property {number} moodWeight — 0/2/6/8/10
 * @property {boolean} hasRework
 * @property {string} [note]
 * @property {string} localDate — YYYY-MM-DD
 * @property {string} timezone
 * @property {string} createdAt — ISO 8601
 * @property {string} updatedAt — ISO 8601
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
 * @property {{bundle_id: number, package_name: number, domain: number, url_pattern: number, app_name: number, title: number, user_mapping: number}} confidence
 */

/**
 * @typedef {Object} RawEvent
 * @property {string} eventId
 * @property {SourcePlatform} platform
 * @property {EventType} eventType
 * @property {string} timestamp — ISO 8601
 * @property {string} [appName]
 * @property {string} [bundleId]
 * @property {string} [packageName]
 * @property {string} domain — hostname only, never full URL
 * @property {string} [urlPattern]
 * @property {string} [windowTitle]
 * @property {number} [tabId]
 * @property {number} [windowId]
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
 * @property {Object<string, {enabled: boolean}>} toolState
 * @property {string[]} customDomains
 * @property {boolean} promptCountingEnabled — P1, default false
 * @property {boolean} nativeMessagingEnabled — P1, default false
 * @property {number} minSessionSeconds — default 15
 * @property {number} suspectedThresholdSeconds — default 30
 * @property {number} mergeWindowMinutes — default 3
 */

/**
 * @typedef {Object} IgnoredTarget
 * @property {string} domain
 * @property {number} addedAt — epoch ms
 */

const _typesPlaceholder = true;
if (typeof globalThis !== 'undefined') {
  globalThis.__murmur_types__ = _typesPlaceholder;
}
