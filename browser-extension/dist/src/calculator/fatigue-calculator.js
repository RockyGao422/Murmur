/**
 * @fileoverview Fatigue Calculator for Murmur Browser Extension.
 * Computes fatigue score 0-100 from detected sessions and ledger entries.
 * Aligned with technical plan formula.
 */

/**
 * @param {Object[]} sessions — DetectedSession[]
 * @param {Object[]} entries — LedgerEntry[]
 * @returns {{score: number, components: Object, level: string}}
 */
function calculateFatigue(sessions, entries) {
  const detectedActiveMinutes = sessions.reduce(
    (sum, s) => sum + (s.activeSeconds || s.duration || 0), 0
  ) / 60;
  const sessionCount = sessions.length;
  const nightCount = sessions.filter((s) => s.isNight).length;

  let toolSwitchCount = 0;
  const sorted = [...sessions].sort((a, b) => {
    const at = typeof a.startedAt === 'string' ? new Date(a.startedAt).getTime() : (a.startTime || 0);
    const bt = typeof b.startedAt === 'string' ? new Date(b.startedAt).getTime() : (b.startTime || 0);
    return at - bt;
  });
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].toolId !== sorted[i - 1].toolId) toolSwitchCount++;
  }

  const pendingCount = sessions.filter(
    (s) => s.status === SessionStatus.PENDING || s.status === SessionStatus.SUSPECTED
  ).length;

  const totalReworkMinutes = entries.reduce((sum, e) => sum + (e.reworkMinutes || 0), 0);
  const avgQualityPenalty = entries.length > 0
    ? entries.reduce((sum, e) => sum + (e.qualityPenalty || QUALITY_PENALTIES[e.quality] || 4), 0) / entries.length
    : 0;
  const avgMoodWeight = entries.length > 0
    ? entries.reduce((sum, e) => sum + (e.moodWeight || MOOD_WEIGHTS[e.mood] || 2), 0) / entries.length
    : 0;
  const completedCount = entries.length;
  const totalNetGain = entries.reduce((sum, e) => sum + (e.netGainMinutes || 0), 0);

  const aiDurationScore = Math.min(18, detectedActiveMinutes / 180 * 18);
  const sessionFrequencyScore = Math.min(14, sessionCount * 2);
  const toolSwitchScore = Math.min(10, toolSwitchCount * 2);
  const nightUsageScore = Math.min(10, nightCount * 4);
  const pendingBacklogScore = Math.min(8, pendingCount * 2);
  const reworkScore = Math.min(15, totalReworkMinutes / 60 * 15);
  const qualityScore = avgQualityPenalty;
  const moodScore = avgMoodWeight;
  const lowGainScore = (completedCount >= 3 && totalNetGain <= 0) ? 8 : 0;

  const score = Math.min(100, Math.max(0, Math.round(
    aiDurationScore + sessionFrequencyScore + toolSwitchScore + nightUsageScore +
    pendingBacklogScore + reworkScore + qualityScore + moodScore + lowGainScore
  )));

  let level = '低';
  if (score >= 70) level = '很高';
  else if (score >= 50) level = '偏高';
  else if (score >= 30) level = '中等';

  return { score, components: {
    aiDuration: aiDurationScore, sessionFrequency: sessionFrequencyScore,
    toolSwitch: toolSwitchScore, nightUsage: nightUsageScore,
    pendingBacklog: pendingBacklogScore, rework: reworkScore,
    quality: qualityScore, mood: moodScore, lowGain: lowGainScore,
  }, level };
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { calculateFatigue });
}
