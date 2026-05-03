/**
 * @fileoverview Weekly Review Generator for Murmur Browser Extension.
 * Analyzes a week's worth of AI usage data and generates insights.
 * Uses the same logic as the macOS application.
 */

/**
 * Generate a weekly review from sessions and entries.
 *
 * @param {Object[]} sessions — all sessions in the week
 * @param {Object[]} entries — all entries in the week
 * @param {string} weekStart — 'YYYY-MM-DD' for Monday
 * @returns {Object} WeeklyReview
 */
function generateReview(sessions, entries, weekStart) {
  // Calculate week end (Sunday)
  const startDate = new Date(weekStart + 'T00:00:00');
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const weekEnd = endDate.toISOString().slice(0, 10);

  // Filter data to this week
  const weekStartTime = startDate.getTime();
  const weekEndTime = endDate.getTime() + 24 * 60 * 60 * 1000;

  const weekSessions = sessions.filter(
    (s) => s.startTime >= weekStartTime && s.startTime < weekEndTime
  );
  const weekEntries = entries.filter(
    (e) => e.createdAt >= weekStartTime && e.createdAt < weekEndTime
  );

  // ========================================================================
  // Basic Metrics
  // ========================================================================

  const totalSessions = weekSessions.length;
  const totalEntries = weekEntries.length;
  const totalDuration = weekSessions.reduce((sum, s) => sum + (s.duration || 0), 0);

  // Total net gain in hours
  const totalNetGain = weekEntries.reduce((sum, e) => sum + (e.netGain || 0), 0);

  // Average quality score
  const scoredEntries = weekEntries.filter(
    (e) => e.qualityScore !== null && e.qualityScore !== undefined
  );
  const avgQualityScore = scoredEntries.length > 0
    ? Math.round(scoredEntries.reduce((sum, e) => sum + e.qualityScore, 0) / scoredEntries.length)
    : 0;

  // ========================================================================
  // Fatigue Score
  // ========================================================================

  let fatigueScore = 0;
  try {
    const fatigue = calculateFatigue(weekSessions, weekEntries);
    fatigueScore = fatigue.score;
  } catch (err) {
    // Fallback: calculateFatigue may not be loaded
    fatigueScore = 0;
  }

  // ========================================================================
  // High-Frequency Tools
  // ========================================================================

  const toolMap = {};
  for (const s of weekSessions) {
    const key = s.toolId || s.toolName;
    if (!toolMap[key]) {
      toolMap[key] = { toolId: s.toolId, toolName: s.toolName, sessions: 0, duration: 0 };
    }
    toolMap[key].sessions++;
    toolMap[key].duration += s.duration || 0;
  }

  const highFrequencyTools = Object.values(toolMap)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);

  // ========================================================================
  // High-Switch Pairs
  // ========================================================================

  // Detect consecutive sessions with different tools
  const sortedSessions = weekSessions
    .filter((s) => s.status !== 'ignored' && s.status !== 'merged')
    .sort((a, b) => a.startTime - b.startTime);

  const switchPairs = {};
  for (let i = 0; i < sortedSessions.length - 1; i++) {
    const from = sortedSessions[i];
    const to = sortedSessions[i + 1];
    if (from.toolId !== to.toolId) {
      const key = `${from.toolId}→${to.toolId}`;
      if (!switchPairs[key]) {
        switchPairs[key] = { from: from.toolName, to: to.toolName, count: 0 };
      }
      switchPairs[key].count++;
    }
  }

  const highSwitchPairs = Object.values(switchPairs)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ========================================================================
  // Pending Backlog
  // ========================================================================

  const pendingBacklog = weekSessions.filter(
    (s) => s.status === 'needs-completion' || s.status === 'suspected-abandoned'
  ).length;

  // ========================================================================
  // Best & Worst Use Cases
  // ======================================================================

  let bestUseCase = null;
  let worstUseCase = null;

  if (scoredEntries.length > 0 && weekSessions.length > 0) {
    // Best: highest quality score with good net gain
    const sorted = [...scoredEntries]
      .filter((e) => e.netGain !== null && e.qualityScore !== null)
      .sort((a, b) => b.qualityScore - a.qualityScore);

    if (sorted.length > 0) {
      const bestEntry = sorted[0];
      const bestSession = weekSessions.find((s) => s.id === bestEntry.sessionId);
      if (bestSession) {
        bestUseCase = { session: bestSession, entry: bestEntry };
      }
    }

    // Worst: lowest quality with worst net gain
    const worstSorted = [...scoredEntries]
      .filter((e) => e.qualityScore !== null)
      .sort((a, b) => a.qualityScore - b.qualityScore);

    if (worstSorted.length > 0) {
      const worstEntry = worstSorted[0];
      const worstSession = weekSessions.find((s) => s.id === worstEntry.sessionId);
      if (worstSession) {
        worstUseCase = { session: worstSession, entry: worstEntry };
      }
    }
  }

  // ========================================================================
  // Insights
  // ========================================================================

  const insights = [];

  // Insight 1: Overall AI usage pattern
  const dailyAvgMinutes = totalDuration / 7 / 60;
  if (dailyAvgMinutes >= 120) {
    insights.push(`本周 AI 使用时间较长，日均 ${Math.round(dailyAvgMinutes)} 分钟。建议评估使用效率，找出可以优化的环节。`);
  } else if (dailyAvgMinutes >= 60) {
    insights.push(`本周 AI 使用适中，日均 ${Math.round(dailyAvgMinutes)} 分钟。保持平衡的 AI 使用习惯。`);
  } else if (dailyAvgMinutes > 0) {
    insights.push(`本周 AI 使用较少，日均 ${Math.round(dailyAvgMinutes)} 分钟。AI 在辅助工具角色上发挥得当。`);
  }

  // Insight 2: Most used tool
  if (highFrequencyTools.length > 0) {
    const top = highFrequencyTools[0];
    insights.push(`使用最多的工具是 "${top.toolName}"，共 ${top.sessions} 次会话，累计 ${Math.round(top.duration / 60)} 分钟。`);
  }

  // Insight 3: Switching behavior
  if (highSwitchPairs.length > 0) {
    const topSwitch = highSwitchPairs[0];
    insights.push(`最频繁的切换路径是从 "${topSwitch.from}" 到 "${topSwitch.to}"，共 ${topSwitch.count} 次。考虑是否需要整合工作流。`);
  }

  // Insight 4: Quality trend
  if (avgQualityScore > 0) {
    if (avgQualityScore >= 80) {
      insights.push(`AI 输出质量整体优秀（平均 ${avgQualityScore}/100），说明你善于利用 AI 解决问题。`);
    } else if (avgQualityScore >= 60) {
      insights.push(`AI 输出质量良好（平均 ${avgQualityScore}/100），有提升空间，可以优化提问方式。`);
    } else {
      insights.push(`AI 输出质量偏低（平均 ${avgQualityScore}/100），建议改进 Prompt 技巧或减少依赖。`);
    }
  }

  // Insight 5: Pending actions
  if (pendingBacklog > 0) {
    insights.push(`本周有 ${pendingBacklog} 个未完成的会话等待处理。及时回顾有助于提高自我认知。`);
  }

  // ========================================================================
  // Assemble Review
  // ========================================================================

  return {
    weekStart,
    weekEnd,
    totalSessions,
    totalEntries,
    totalDuration,
    totalNetGain: Math.round(totalNetGain * 100) / 100,
    avgQualityScore,
    fatigueScore,
    highFrequencyTools,
    highSwitchPairs,
    pendingBacklog,
    bestUseCase,
    worstUseCase,
    insights,
    generatedAt: Date.now(),
  };
}

/**
 * Generate a date-based string (e.g., "2026-W05") from week start.
 * @param {string} weekStart — 'YYYY-MM-DD'
 * @returns {string}
 */
function getWeekLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  const year = d.getFullYear();
  // ISO week number approximation
  const jan1 = new Date(year, 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get the Monday of the current week.
 * @returns {string} 'YYYY-MM-DD'
 */
function getCurrentWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

// Export to global scope
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    generateReview,
    getWeekLabel,
    getCurrentWeekStart,
  });
}
