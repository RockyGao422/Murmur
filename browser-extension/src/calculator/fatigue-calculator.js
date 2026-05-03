/**
 * @fileoverview Fatigue Calculator for Murmur Browser Extension.
 * Computes a 0-100 fatigue score based on daily AI usage patterns.
 * Higher score = more fatigue / over-reliance on AI.
 * Uses the same formulas as the macOS application.
 */

/**
 * Individual fatigue component scores (each 0-100).
 */
const MAX_COMPONENT_SCORES = {
  DURATION: 35,      // Max from total duration
  SESSION_COUNT: 20, // Max from session fragmentation
  PROMPT_VELOCITY: 20, // Max from rapid prompting
  QUALITY_DROP: 15,  // Max from declining quality
  LATE_NIGHT: 10,    // Max from late-night usage
};

/**
 * Calculate the duration component of fatigue.
 * More total AI time = higher fatigue.
 *
 * @param {number} totalMinutes — total AI usage time in minutes
 * @returns {number} 0-35
 */
function calcDurationFatigue(totalMinutes) {
  // Linear scale: 0 → 120+ minutes
  // 0 min = 0, 60 min = 17.5, 120+ min = 35
  return Math.min(MAX_COMPONENT_SCORES.DURATION, (totalMinutes / 120) * MAX_COMPONENT_SCORES.DURATION);
}

/**
 * Calculate the session count/fragmentation component.
 * Many short sessions suggest fragmented attention.
 *
 * @param {number} sessionCount — number of sessions
 * @param {number} totalMinutes
 * @returns {number} 0-20
 */
function calcSessionFatigue(sessionCount, totalMinutes) {
  if (sessionCount === 0) return 0;

  // Fragmentation index: sessions per hour
  const sessionsPerHour = (sessionCount / Math.max(totalMinutes, 1)) * 60;

  // 0-2 sessions/hour = 0, 2-4 = 10, 4-6 = 15, 6+ = 20
  if (sessionsPerHour <= 2) return 0;
  if (sessionsPerHour <= 4) return 10;
  if (sessionsPerHour <= 6) return 15;
  return MAX_COMPONENT_SCORES.SESSION_COUNT;
}

/**
 * Calculate the prompt velocity component.
 * Rapid-fire prompts suggest over-reliance.
 *
 * @param {Object[]} entries — ledger entries for the day
 * @returns {number} 0-20
 */
function calcPromptVelocityFatigue(entries) {
  if (entries.length === 0) return 0;

  let totalPrompts = 0;
  let totalDuration = 0;
  for (const entry of entries) {
    if (entry.promptCount) totalPrompts += entry.promptCount;
    totalDuration += entry.duration || 0;
  }

  if (totalDuration === 0) return 0;
  const promptsPerHour = (totalPrompts / totalDuration) * 3600;

  // 0-10 prompts/hour = 0, 10-20 = 10, 20-30 = 15, 30+ = 20
  if (promptsPerHour <= 10) return 0;
  if (promptsPerHour <= 20) return 10;
  if (promptsPerHour <= 30) return 15;
  return MAX_COMPONENT_SCORES.PROMPT_VELOCITY;
}

/**
 * Calculate the quality drop component.
 * Declining quality scores across the day suggest fatigue.
 *
 * @param {Object[]} entries — sorted by time
 * @returns {number} 0-15
 */
function calcQualityDropFatigue(entries) {
  const scored = entries.filter((e) => e.qualityScore !== null && e.qualityScore !== undefined);
  if (scored.length < 2) return 0;

  // Compare first half average with second half average
  const mid = Math.floor(scored.length / 2);
  const firstHalf = scored.slice(0, mid);
  const secondHalf = scored.slice(mid);

  const firstAvg = firstHalf.reduce((sum, e) => sum + e.qualityScore, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, e) => sum + e.qualityScore, 0) / secondHalf.length;

  const drop = firstAvg - secondAvg;
  if (drop <= 0) return 0;
  if (drop <= 5) return 5;
  if (drop <= 15) return 10;
  return MAX_COMPONENT_SCORES.QUALITY_DROP;
}

/**
 * Calculate the late-night component.
 * Sessions after 10 PM contribute to fatigue.
 *
 * @param {Object[]} sessions — sessions for the day
 * @returns {number} 0-10
 */
function calcLateNightFatigue(sessions) {
  if (sessions.length === 0) return 0;

  let lateNightMinutes = 0;
  for (const session of sessions) {
    const startTime = session.startTime;
    const endTime = session.endTime || session.startTime + (session.duration * 1000);

    // Check how much of the session falls after 22:00 or before 06:00
    const startHour = new Date(startTime).getHours();
    const endHour = new Date(endTime).getHours();

    // If session is entirely late night
    if (startHour >= 22 || startHour < 6 || endHour >= 22 || endHour < 6) {
      lateNightMinutes += session.duration / 60;
    }
  }

  // 0-5 min = 0, 5-15 = 5, 15+ = 10
  if (lateNightMinutes <= 5) return 0;
  if (lateNightMinutes <= 15) return 5;
  return MAX_COMPONENT_SCORES.LATE_NIGHT;
}

/**
 * Calculate the overall fatigue score (0-100).
 *
 * @param {Object[]} sessions — today's sessions
 * @param {Object[]} entries — today's ledger entries
 * @returns {Object} computed fatigue data
 */
function calculateFatigue(sessions, entries) {
  // Total AI usage time
  const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalMinutes = totalSeconds / 60;
  const sessionCount = sessions.length;

  // Individual components
  const durationComponent = calcDurationFatigue(totalMinutes);
  const sessionComponent = calcSessionFatigue(sessionCount, totalMinutes);
  const promptVelocityComponent = calcPromptVelocityFatigue(entries);
  const qualityDropComponent = calcQualityDropFatigue(entries);
  const lateNightComponent = calcLateNightFatigue(sessions);

  // Total fatigue score
  const total = (
    durationComponent +
    sessionComponent +
    promptVelocityComponent +
    qualityDropComponent +
    lateNightComponent
  );

  // Clamp to 0-100
  const score = Math.round(Math.min(100, Math.max(0, total)));

  // Severity level
  let level;
  if (score <= 20) level = 'low';
  else if (score <= 40) level = 'moderate';
  else if (score <= 60) level = 'elevated';
  else if (score <= 80) level = 'high';
  else level = 'severe';

  return {
    score,
    level,
    components: {
      duration: Math.round(durationComponent),
      sessionCount: Math.round(sessionComponent),
      promptVelocity: Math.round(promptVelocityComponent),
      qualityDrop: Math.round(qualityDropComponent),
      lateNight: Math.round(lateNightComponent),
    },
    metrics: {
      totalMinutes: Math.round(totalMinutes),
      sessionCount,
      entryCount: entries.length,
    },
  };
}

/**
 * Get a human-readable fatigue description.
 * @param {string} level
 * @returns {string}
 */
function getFatigueDescription(level) {
  const descriptions = {
    low: 'AI 使用处于健康水平，没有明显的疲劳或过度依赖迹象。',
    moderate: 'AI 使用适度。注意保持平衡，避免过度依赖。',
    elevated: 'AI 使用频率和时长偏高。建议适当休息，减少对 AI 的依赖。',
    high: 'AI 使用已达到较高水平。疲劳和过度依赖的风险显著增加。请考虑减少 AI 使用时间。',
    severe: 'AI 使用严重过度。强烈建议减少 AI 使用，关注自身能力和精神状态。',
  };
  return descriptions[level] || descriptions.low;
}

/**
 * Get recommended actions based on fatigue data.
 * @param {Object} fatigue — from calculateFatigue()
 * @returns {string[]}
 */
function getFatigueRecommendations(fatigue) {
  const recs = [];

  if (fatigue.components.duration > 20) {
    recs.push('减少每日 AI 使用总时长，设定每日使用上限');
  }
  if (fatigue.components.sessionCount > 10) {
    recs.push('减少 AI 会话碎片化，集中使用减少切换');
  }
  if (fatigue.components.promptVelocity > 10) {
    recs.push('放慢与 AI 的交互节奏，先思考再提问');
  }
  if (fatigue.components.qualityDrop > 5) {
    recs.push('注意后半天的 AI 使用质量下降，避免疲劳状态下使用 AI');
  }
  if (fatigue.components.lateNight > 5) {
    recs.push('避免深夜使用 AI，保障充足睡眠');
  }

  if (recs.length === 0) {
    recs.push('继续保持当前健康的 AI 使用习惯');
  }

  return recs;
}

// Export to global scope
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    calculateFatigue,
    getFatigueDescription,
    getFatigueRecommendations,
    MAX_COMPONENT_SCORES,
  });
}
