/**
 * @fileoverview Weekly Review Engine for Murmur Browser Extension.
 * Aligned with technical plan. Uses activeSeconds/rawDomain/startedAt fields.
 */

/**
 * @param {Object[]} sessions
 * @param {Object[]} entries
 * @param {string} weekStart — 'YYYY-MM-DD'
 * @returns {Object}
 */
function generateReview(sessions, entries, weekStart) {
  const weekStartTime = new Date(weekStart + 'T00:00:00').getTime();
  const weekEnd = new Date(weekStart + 'T00:00:00');
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndTime = weekEnd.getTime();
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const weekSessions = sessions.filter((s) => {
    const t = typeof s.startedAt === 'string' ? new Date(s.startedAt).getTime() : (s.startTime || 0);
    return t >= weekStartTime && t < weekEndTime;
  });

  const totalSeconds = weekSessions.reduce((sum, s) => sum + (s.activeSeconds || s.duration || 0), 0);
  const totalNetGain = entries.reduce((sum, e) => sum + (e.netGainMinutes || 0), 0);
  const pendingCount = weekSessions.filter(
    (s) => s.status === SessionStatus.PENDING || s.status === SessionStatus.SUSPECTED
  ).length;

  const toolMap = {};
  for (const s of weekSessions) {
    const key = s.toolName || s.toolId;
    if (!toolMap[key]) toolMap[key] = { toolName: key, sessions: 0, seconds: 0 };
    toolMap[key].sessions++;
    toolMap[key].seconds += (s.activeSeconds || s.duration || 0);
  }
  const toolRanking = Object.values(toolMap).sort((a, b) => b.sessions - a.sessions);

  const insights = [];
  if (toolRanking.length > 0) {
    insights.push(`使用最多的工具是 "${toolRanking[0].toolName}"，共 ${toolRanking[0].sessions} 次。`);
  }
  if (pendingCount >= 5) {
    insights.push(`还有 ${pendingCount} 条会话待补全，补全后才能计算真实净收益。`);
  }

  const recommendations = [];
  if (pendingCount >= 5) recommendations.push(`补全 ${pendingCount} 条待补全会话。`);
  if (totalNetGain < 0 && entries.length >= 3) recommendations.push('本周 AI 净收益为负，建议评估使用方式。');
  if (recommendations.length === 0) recommendations.push('保持良好的 AI 使用习惯。');

  return { weekStart, weekEnd: weekEndStr, totalSessions: weekSessions.length,
    totalDurationSeconds: totalSeconds, totalNetGainMinutes: totalNetGain,
    pendingCount, toolRanking, insights, recommendations };
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, { generateReview });
}
