/**
 * @fileoverview Ledger Entry Calculator for Murmur Browser Extension.
 * Aligned with shared/schemas/ledger-entry.schema.json.
 * Uses minutes-based fields: estimatedSavedMinutes, promptMinutes, reviewMinutes, etc.
 */

/**
 * @param {Object} draft
 * @param {number} draft.estimatedSavedMinutes
 * @param {number} draft.promptMinutes
 * @param {number} draft.reviewMinutes
 * @param {number} draft.editMinutes
 * @param {number} draft.debugMinutes
 * @param {number} draft.reworkMinutes
 * @param {string} draft.quality — 'direct_use'|'minor_edit'|'major_edit'|'useless'
 * @param {string} draft.mood — 'easy'|'neutral'|'irritated'|'tired'|'anxious'
 * @returns {Object} calculated entry
 */
function calculateEntry(draft) {
  const qualityScore = QUALITY_SCORES[draft.quality] || 3;
  const qualityPenalty = QUALITY_PENALTIES[draft.quality] || 4;
  const moodWeight = MOOD_WEIGHTS[draft.mood] || 2;

  const totalExtraCostMinutes =
    (draft.promptMinutes || 0) +
    (draft.reviewMinutes || 0) +
    (draft.editMinutes || 0) +
    (draft.debugMinutes || 0) +
    (draft.reworkMinutes || 0);

  const netGainMinutes = (draft.estimatedSavedMinutes || 0) - totalExtraCostMinutes;

  const hasRework =
    (draft.reworkMinutes || 0) > 0 ||
    draft.quality === OutputQuality.USELESS ||
    (netGainMinutes < 0 && totalExtraCostMinutes >= (draft.estimatedSavedMinutes || 0));

  return {
    qualityScore,
    qualityPenalty,
    moodWeight,
    totalExtraCostMinutes,
    netGainMinutes,
    hasRework,
  };
}

/**
 * Suggest default values for a session completion form.
 * @param {Object} session
 * @returns {{estimatedSaved: number, promptMinutes: number, reviewMinutes: number, editMinutes: number, debugMinutes: number, reworkMinutes: number, quality: string}}
 */
function suggestedDefaults(session) {
  const activeMinutes = Math.floor((session.activeSeconds || session.duration || 0) / 60);
  const promptMinutes = Math.min(activeMinutes || 5, 5);
  return {
    estimatedSaved: 15,
    promptMinutes,
    reviewMinutes: 5,
    editMinutes: 0,
    debugMinutes: 0,
    reworkMinutes: 0,
    quality: OutputQuality.MINOR_EDIT,
  };
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { calculateEntry, suggestedDefaults });
}
