/**
 * @fileoverview Enum-like constants for Murmur Browser Extension.
 * Uses frozen objects to emulate TypeScript enums in plain JavaScript.
 */

/** @enum {string} */
const SourcePlatform = Object.freeze({
  BROWSER_CHATGPT: 'browser-chatgpt',
  BROWSER_CLAUDE: 'browser-claude',
  BROWSER_GEMINI: 'browser-gemini',
  BROWSER_COPILOT: 'browser-copilot',
  BROWSER_DEEPSEEK: 'browser-deepseek',
  BROWSER_DOUBAO: 'browser-doubao',
  BROWSER_KIMI: 'browser-kimi',
  BROWSER_TONGYI: 'browser-tongyi',
  BROWSER_WENXIN: 'browser-wenxin',
  BROWSER_XUNFEI: 'browser-xunfei',
  BROWSER_METASO: 'browser-metaso',
  BROWSER_YUANBAO: 'browser-yuanbao',
  BROWSER_PERPLEXITY: 'browser-perplexity',
  BROWSER_POE: 'browser-poe',
  BROWSER_MIDJOURNEY: 'browser-midjourney',
  BROWSER_CODEX: 'browser-codex',
  BROWSER_UNKNOWN: 'browser-unknown',
});

/** @enum {string} */
const SourceKind = Object.freeze({
  CREATIVE: 'creative',
  ANALYTICAL: 'analytical',
  DEBUGGING: 'debugging',
  CONVERSATIONAL: 'conversational',
  MIXED: 'mixed',
});

/** @enum {string} */
const SessionStatus = Object.freeze({
  COMPLETED: 'completed',
  PAUSED: 'paused',
  ABANDONED: 'abandoned',
  SUSPECTED_ABANDONED: 'suspected-abandoned',
  NEEDS_COMPLETION: 'needs-completion',
  IGNORED: 'ignored',
  MERGED: 'merged',
});

/** @enum {string} */
const OutputQuality = Object.freeze({
  EXCELLENT: 'excellent',
  GOOD: 'good',
  NEUTRAL: 'neutral',
  MAYBE_PROMPTED: 'maybe-prompted',
  PROMPTED: 'prompted',
});

/** @enum {string} */
const UserMood = Object.freeze({
  GREAT: 'great',
  NEUTRAL: 'neutral',
  FRUSTRATED: 'frustrated',
  TIRED: 'tired',
  RUSHED: 'rushed',
});

/** @enum {string} */
const DetectionStatus = Object.freeze({
  CONFIRMED: 'confirmed',
  AUTO: 'auto',
  FUZZY: 'fuzzy',
  USER_MAPPED: 'user-mapped',
});

/** @enum {string} */
const EventType = Object.freeze({
  TAB_ACTIVATED: 'tab-activated',
  TAB_UPDATED: 'tab-updated',
  TAB_REMOVED: 'tab-removed',
  WINDOW_FOCUS_CHANGED: 'window-focus-changed',
  NAVIGATION_COMMITTED: 'navigation-committed',
  IDLE_STATE_CHANGED: 'idle-state-changed',
});

/**
 * Quality score mappings by OutputQuality level.
 * Base score before applying penalty and mood modifiers.
 */
const QUALITY_SCORES = Object.freeze({
  [OutputQuality.EXCELLENT]: 95,
  [OutputQuality.GOOD]: 80,
  [OutputQuality.NEUTRAL]: 65,
  [OutputQuality.MAYBE_PROMPTED]: 50,
  [OutputQuality.PROMPTED]: 35,
});

/**
 * Quality penalty mappings by OutputQuality level.
 * Extra deduction for prompted/rework scenarios.
 */
const QUALITY_PENALTIES = Object.freeze({
  [OutputQuality.EXCELLENT]: 0,
  [OutputQuality.GOOD]: 5,
  [OutputQuality.NEUTRAL]: 10,
  [OutputQuality.MAYBE_PROMPTED]: 18,
  [OutputQuality.PROMPTED]: 25,
});

/**
 * Mood weight multipliers.
 * Applied to netGain calculation.
 */
const MOOD_WEIGHTS = Object.freeze({
  [UserMood.GREAT]: 1.3,
  [UserMood.NEUTRAL]: 1.0,
  [UserMood.FRUSTATED]: 0.8,
  [UserMood.TIRED]: 0.7,
  [UserMood.RUSHED]: 0.85,
});

/**
 * Map toolId to SourcePlatform prefix.
 * @param {string} toolId
 * @returns {string}
 */
function toolIdToPlatform(toolId) {
  const PLATFORM_MAP = {
    'chatgpt': SourcePlatform.BROWSER_CHATGPT,
    'claude': SourcePlatform.BROWSER_CLAUDE,
    'gemini': SourcePlatform.BROWSER_GEMINI,
    'copilot': SourcePlatform.BROWSER_COPILOT,
    'deepseek': SourcePlatform.BROWSER_DEEPSEEK,
    'doubao': SourcePlatform.BROWSER_DOUBAO,
    'kimi': SourcePlatform.BROWSER_KIMI,
    'tongyi': SourcePlatform.BROWSER_TONGYI,
    'wenxin': SourcePlatform.BROWSER_WENXIN,
    'xunfei': SourcePlatform.BROWSER_XUNFEI,
    'metaso': SourcePlatform.BROWSER_METASO,
    'yuanbao': SourcePlatform.BROWSER_YUANBAO,
    'perplexity': SourcePlatform.BROWSER_PERPLEXITY,
    'poe': SourcePlatform.BROWSER_POE,
    'midjourney': SourcePlatform.BROWSER_MIDJOURNEY,
    'codex': SourcePlatform.BROWSER_CODEX,
  };
  return PLATFORM_MAP[toolId] || SourcePlatform.BROWSER_UNKNOWN;
}

// Export for use in other modules (loaded via importScripts or global scope)
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    SourcePlatform,
    SourceKind,
    SessionStatus,
    OutputQuality,
    UserMood,
    DetectionStatus,
    EventType,
    QUALITY_SCORES,
    QUALITY_PENALTIES,
    MOOD_WEIGHTS,
    toolIdToPlatform,
  });
}
