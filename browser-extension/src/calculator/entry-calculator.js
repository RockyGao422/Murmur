/**
 * @fileoverview Ledger Entry Calculator for Murmur Browser Extension.
 * Computes quality scores, penalties, mood weights, and net gain
 * from session data and user-provided draft entry fields.
 * Uses the same formulas as the macOS application.
 */

/**
 * Base quality scores by output quality level.
 */
const BASE_SCORES = {
  excellent: 95,
  good: 80,
  neutral: 65,
  'maybe-prompted': 50,
  prompted: 35,
};

/**
 * Quality penalties by output quality level.
 */
const QUALITY_PENALTY_MAP = {
  excellent: 0,
  good: 5,
  neutral: 10,
  'maybe-prompted': 18,
  prompted: 25,
};

/**
 * Mood weight multipliers applied to net gain.
 */
const MOOD_WEIGHT_MAP = {
  great: 1.3,
  neutral: 1.0,
  frustrated: 0.8,
  tired: 0.7,
  rushed: 0.85,
};

/**
 * Rework penalty factor.
 * If rework is detected, additional penalty is applied.
 */
const REWORK_BASE_PENALTY = 10;

/**
 * Calculate a complete ledger entry from a draft and session data.
 *
 * @param {Object} draft — user-provided or auto-sensed entry data
 * @param {number} draft.duration — session duration in seconds
 * @param {string|null} [draft.outputQuality] — 'excellent'|'good'|'neutral'|'maybe-prompted'|'prompted'
 * @param {number|null} [draft.extraCostFraction] — 0-1, fraction of time spent reworking AI output
 * @param {string|null} [draft.mood] — 'great'|'neutral'|'frustrated'|'tired'|'rushed'
 * @param {boolean} [draft.hasRework] — whether rework was detected
 * @param {number|null} [draft.promptCount] — number of prompts sent
 * @param {string} [draft.sourceKind] — 'creative'|'analytical'|'debugging'|'conversational'|'mixed'
 * @returns {Object} computed entry values
 */
function calculateEntry(draft) {
  const {
    duration = 0,
    outputQuality = null,
    extraCostFraction = null,
    mood = null,
    hasRework = false,
    promptCount = null,
    sourceKind = 'mixed',
  } = draft;

  // ========================================================================
  // Quality Score & Penalty
  // ========================================================================

  /** @type {number|null} */
  let qualityScore = null;
  let qualityPenalty = 0;

  if (outputQuality && BASE_SCORES[outputQuality] !== undefined) {
    qualityScore = BASE_SCORES[outputQuality];
    qualityPenalty = QUALITY_PENALTY_MAP[outputQuality];
  }

  // Additional rework penalty
  if (hasRework) {
    qualityPenalty += REWORK_BASE_PENALTY;
    // If quality was assessed but rework found, reduce score
    if (qualityScore !== null) {
      qualityScore = Math.max(0, qualityScore - REWORK_BASE_PENALTY);
    }
  }

  // Prompt-count heuristic: many prompts on a short session suggests lower quality
  if (promptCount && duration > 0) {
    const promptsPerMinute = (promptCount / duration) * 60;
    if (promptsPerMinute > 3) {
      // High prompt velocity suggests iterative prompting / low first-pass quality
      qualityPenalty += Math.min(10, Math.floor(promptsPerMinute - 3) * 2);
      if (qualityScore !== null) {
        qualityScore = Math.max(0, qualityScore - Math.min(10, Math.floor(promptsPerMinute - 3) * 2));
      }
    }
  }

  // Cap penalty at 25
  qualityPenalty = Math.min(25, qualityPenalty);

  // ========================================================================
  // Extra Cost & Net Gain
  // ========================================================================

  /** @type {number|null} */
  let totalExtraCost = null;
  /** @type {number|null} */
  let netGain = null;

  if (extraCostFraction !== null && extraCostFraction >= 0 && extraCostFraction <= 1) {
    totalExtraCost = extraCostFraction * duration;
    // Net gain: time saved (duration minus rework time), in hours
    netGain = (duration - totalExtraCost) / 3600;
    // Apply mood weight
    if (mood && MOOD_WEIGHT_MAP[mood] !== undefined) {
      netGain *= MOOD_WEIGHT_MAP[mood];
    }
    // Net gain cannot be negative (worst case: no gain)
    netGain = Math.max(0, netGain);
  }

  // ========================================================================
  // Mood Weight
  // ========================================================================

  const moodWeight = mood ? (MOOD_WEIGHT_MAP[mood] || 1.0) : null;

  // ========================================================================
  // Summary
  // ========================================================================

  return {
    qualityScore,
    qualityPenalty,
    totalExtraCost,
    netGain,
    moodWeight,
    hasRework,
    sourceKind,
  };
}

/**
 * Auto-suggest output quality based on session characteristics.
 * Heuristic only — should be confirmed by user.
 *
 * @param {Object} session — session data
 * @param {number} session.duration — seconds
 * @param {number|null} session.promptCount
 * @returns {string|null} suggested output quality or null if uncertain
 */
function suggestQuality(session) {
  const { duration, promptCount } = session;

  // Very short sessions are likely exploration or failed attempts
  if (duration < 60) return null;

  if (promptCount === null || promptCount === undefined) return null;

  const promptsPerMinute = (promptCount / duration) * 60;

  // Few prompts over a long session suggests good first-pass quality
  if (duration > 600 && promptsPerMinute < 1) return 'excellent';
  if (duration > 300 && promptsPerMinute < 2) return 'good';
  if (promptsPerMinute < 3) return 'neutral';
  if (promptsPerMinute < 5) return 'maybe-prompted';

  // Many prompts in short time
  if (promptsPerMinute >= 5) return 'prompted';

  return null;
}

/**
 * Auto-suggest rework detection based on session characteristics.
 *
 * @param {Object} session
 * @param {number} session.duration
 * @param {number|null} session.promptCount
 * @param {boolean} [hasSwitchToSameTool] — whether user switched away and back
 * @returns {boolean}
 */
function suggestRework(session) {
  const { duration, promptCount } = session;

  if (promptCount === null || promptCount === undefined) return false;

  const promptsPerMinute = (promptCount / duration) * 60;

  // High prompt velocity combined with long duration suggests iterative fixing
  if (duration > 300 && promptsPerMinute > 3) return true;

  // Very high prompt velocity at any duration
  if (promptsPerMinute > 5) return true;

  return false;
}

/**
 * Format net gain for display.
 * @param {number|null} netGain — hours
 * @returns {string}
 */
function formatNetGain(netGain) {
  if (netGain === null) return '—';
  const minutes = netGain * 60;
  if (minutes < 1) return '< 1分钟';
  if (minutes < 60) return `${Math.round(minutes)}分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours}小时`;
  return `${hours}小时${mins}分钟`;
}

// Export to global scope
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    calculateEntry,
    suggestQuality,
    suggestRework,
    formatNetGain,
    BASE_SCORES,
    QUALITY_PENALTY_MAP,
    MOOD_WEIGHT_MAP,
  });
}
