/**
 * @fileoverview Enum constants for Murmur Browser Extension.
 * Aligned with shared/schemas/ for cross-platform consistency.
 * Uses frozen objects for immutability.
 */

/** @enum {string} Aligned with shared schema source_platform */
const SourcePlatform = Object.freeze({
  MACOS: 'macos',
  ANDROID: 'android',
  BROWSER: 'browser',
});

/** @enum {string} Aligned with shared schema source_kind */
const SourceKind = Object.freeze({
  APP: 'app',
  WEB: 'web',
});

/** @enum {string} Aligned with shared schema status */
const SessionStatus = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  IGNORED: 'ignored',
  MERGED: 'merged',
  SUSPECTED: 'suspected',
});

/** @enum {string} Aligned with shared schema quality */
const OutputQuality = Object.freeze({
  DIRECT_USE: 'direct_use',
  MINOR_EDIT: 'minor_edit',
  MAJOR_EDIT: 'major_edit',
  USELESS: 'useless',
});

/** @enum {string} Aligned with shared schema mood */
const UserMood = Object.freeze({
  EASY: 'easy',
  NEUTRAL: 'neutral',
  IRRITATED: 'irritated',
  TIRED: 'tired',
  ANXIOUS: 'anxious',
});

/** @enum {string} */
const DetectionStatus = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
  DISABLED: 'disabled',
});

/** @enum {string} Browser-level internal event types */
const EventType = Object.freeze({
  TAB_ACTIVATED: 'tab_activated',
  TAB_UPDATED: 'tab_updated',
  TAB_REMOVED: 'tab_removed',
  WINDOW_FOCUS_CHANGED: 'window_focus_changed',
  NAVIGATION_COMMITTED: 'navigation_committed',
  IDLE_STATE_CHANGED: 'idle_state_changed',
});

/** @enum {string} Canonical event types aligned with shared/schemas/raw-event.schema.json */
const CanonicalEventType = Object.freeze({
  TAB_ACTIVE: 'tab_active',
  TAB_INACTIVE: 'tab_inactive',
  NAVIGATION: 'navigation',
  CLOSE: 'close',
});

/**
 * Maps internal browser EventType values to canonical event types.
 * WINDOW_FOCUS_CHANGED maps to tab_inactive (blur) or tab_active (focus) at runtime.
 */
const EVENT_TYPE_TO_CANONICAL = Object.freeze({
  [EventType.TAB_ACTIVATED]: CanonicalEventType.TAB_ACTIVE,
  [EventType.TAB_UPDATED]: CanonicalEventType.NAVIGATION,
  [EventType.NAVIGATION_COMMITTED]: CanonicalEventType.NAVIGATION,
  [EventType.TAB_REMOVED]: CanonicalEventType.CLOSE,
  // WINDOW_FOCUS_CHANGED: determined at runtime by focused flag
});

/** @enum {string} Sync status for Native Messaging */
const SyncStatus = Object.freeze({
  LOCAL_ONLY: 'local_only',
  PENDING: 'pending',
  SYNCED: 'synced',
  FAILED: 'failed',
});

/** @enum {string} Use case categories, aligned with macOS canonical set */
const UseCase = Object.freeze({
  CODE_GENERATION: 'code_generation',
  CODE_REVIEW: 'code_review',
  DEBUGGING: 'debugging',
  CONTENT_WRITING: 'content_writing',
  CONTENT_TRANSLATION: 'content_translation',
  RESEARCH: 'research',
  LEARNING: 'learning',
  CREATIVE: 'creative',
  OTHER: 'other',
});

/**
 * Quality score mappings (1-4 → integer).
 */
const QUALITY_SCORES = Object.freeze({
  [OutputQuality.DIRECT_USE]: 4,
  [OutputQuality.MINOR_EDIT]: 3,
  [OutputQuality.MAJOR_EDIT]: 2,
  [OutputQuality.USELESS]: 1,
});

/**
 * Quality penalty for fatigue calculation.
 */
const QUALITY_PENALTIES = Object.freeze({
  [OutputQuality.DIRECT_USE]: 0,
  [OutputQuality.MINOR_EDIT]: 4,
  [OutputQuality.MAJOR_EDIT]: 9,
  [OutputQuality.USELESS]: 14,
});

/**
 * Mood weight for fatigue calculation.
 */
const MOOD_WEIGHTS = Object.freeze({
  [UserMood.EASY]: 0,
  [UserMood.NEUTRAL]: 2,
  [UserMood.IRRITATED]: 6,
  [UserMood.TIRED]: 8,
  [UserMood.ANXIOUS]: 10,
});

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    SourcePlatform,
    SourceKind,
    SessionStatus,
    OutputQuality,
    UserMood,
    DetectionStatus,
    EventType,
    CanonicalEventType,
    EVENT_TYPE_TO_CANONICAL,
    SyncStatus,
    UseCase,
    QUALITY_SCORES,
    QUALITY_PENALTIES,
    MOOD_WEIGHTS,
  });
}
