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

/** @enum {string} */
const EventType = Object.freeze({
  TAB_ACTIVATED: 'tab_activated',
  TAB_UPDATED: 'tab_updated',
  TAB_REMOVED: 'tab_removed',
  WINDOW_FOCUS_CHANGED: 'window_focus_changed',
  NAVIGATION_COMMITTED: 'navigation_committed',
  IDLE_STATE_CHANGED: 'idle_state_changed',
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
    QUALITY_SCORES,
    QUALITY_PENALTIES,
    MOOD_WEIGHTS,
  });
}
