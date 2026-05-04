/**
 * @fileoverview Session Aggregator for Murmur Browser Extension.
 * Provides cross-session aggregation: merge adjacent, interval union,
 * gross vs deduped active_seconds, tool/source distribution.
 * Algorithm shared across all three platforms.
 */

// ============================================================================
// Filtering
// ============================================================================

/**
 * Include sessions for aggregation: pending, completed, suspected.
 * Exclude: ignored, merged.
 */
function isIncluded(session) {
  const status = session.status;
  return status === SessionStatus.PENDING ||
         status === SessionStatus.COMPLETED ||
         status === SessionStatus.SUSPECTED;
}

function normalizeSessions(sessions) {
  return (sessions || []).filter(isIncluded);
}

// ============================================================================
// Adjacent Merge
// ============================================================================

/**
 * Merge sessions of the same tool within the window (default 180s).
 * Same device, same source_platform, same source_kind, same tool_id.
 * Does NOT modify originals — returns new array.
 */
function mergeAdjacentSessions(sessions, windowSeconds = 180) {
  const included = normalizeSessions(sessions);
  if (included.length <= 1) return [...included];

  const sorted = [...included].sort((a, b) =>
    new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const sameTool = current.toolId === next.toolId;
    const sameSource = current.sourcePlatform === next.sourcePlatform &&
                       current.sourceKind === next.sourceKind;
    const gap = (new Date(next.startedAt).getTime() - new Date(current.endedAt).getTime()) / 1000;

    if (sameTool && sameSource && gap > 0 && gap <= windowSeconds) {
      current = {
        ...current,
        endedAt: new Date(Math.max(
          new Date(current.endedAt).getTime(),
          new Date(next.endedAt).getTime()
        )).toISOString(),
        activeSeconds: (current.activeSeconds || 0) + (next.activeSeconds || 0),
        promptCount: (current.promptCount || 0) + (next.promptCount || 0),
        status: current.status === SessionStatus.COMPLETED ? SessionStatus.COMPLETED : next.status,
        updatedAt: new Date().toISOString(),
      };
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

// ============================================================================
// Active Seconds
// ============================================================================

/**
 * Gross active seconds: simple sum of all included sessions' activeSeconds.
 */
function calculateGrossActiveSeconds(sessions) {
  return normalizeSessions(sessions).reduce((sum, s) => sum + (s.activeSeconds || 0), 0);
}

/**
 * Deduped active seconds: interval union of all session time ranges.
 * Prevents double-counting when user uses AI on multiple platforms simultaneously.
 */
function calculateDedupedActiveSeconds(sessions) {
  const included = normalizeSessions(sessions);
  if (included.length === 0) return 0;

  const intervals = included
    .filter(s => s.activeSeconds >= 15)
    .map(s => ({
      start: new Date(s.startedAt).getTime(),
      end: new Date(s.endedAt).getTime(),
    }))
    .sort((a, b) => a.start - b.start);

  if (intervals.length === 0) return 0;

  const merged = [];
  let current = { start: intervals[0].start, end: intervals[0].end };

  for (let i = 1; i < intervals.length; i++) {
    if (intervals[i].start > current.end) {
      merged.push(current);
      current = { start: intervals[i].start, end: intervals[i].end };
    } else {
      current.end = Math.max(current.end, intervals[i].end);
    }
  }
  merged.push(current);

  return Math.floor(merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0) / 1000);
}

// ============================================================================
// Distribution
// ============================================================================

/**
 * Tool distribution: { toolName: totalActiveSeconds } sorted desc.
 */
function calculateToolDistribution(sessions) {
  const included = normalizeSessions(sessions);
  const dist = {};
  for (const s of included) {
    const name = s.toolName || s.toolId || 'Unknown';
    dist[name] = (dist[name] || 0) + (s.activeSeconds || 0);
  }
  return Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(([toolName, seconds]) => ({ toolName, seconds }));
}

/**
 * Source distribution: { source_platform + source_kind: totalActiveSeconds }.
 */
function calculateSourceDistribution(sessions) {
  const included = normalizeSessions(sessions);
  const dist = {};
  for (const s of included) {
    const key = `${s.sourcePlatform || 'unknown'}_${s.sourceKind || 'unknown'}`;
    dist[key] = (dist[key] || 0) + (s.activeSeconds || 0);
  }
  return dist;
}

/**
 * Breakdown by source category.
 * Returns { appActiveSeconds, webActiveSeconds }.
 */
function calculateAppWebBreakdown(sessions) {
  const included = normalizeSessions(sessions);
  let app = 0;
  let web = 0;
  for (const s of included) {
    if (s.sourceKind === SourceKind.WEB) {
      web += (s.activeSeconds || 0);
    } else {
      app += (s.activeSeconds || 0);
    }
  }
  return { appActiveSeconds: app, webActiveSeconds: web };
}

// ============================================================================
// Completion Rate
// ============================================================================

function calculateCompletionRate(sessions, entries) {
  const included = normalizeSessions(sessions);
  const pendingCount = included.filter(
    s => s.status === SessionStatus.PENDING || s.status === SessionStatus.SUSPECTED
  ).length;
  const completedCount = included.filter(
    s => s.status === SessionStatus.COMPLETED
  ).length;
  const totalRelevant = pendingCount + completedCount;
  return totalRelevant > 0 ? completedCount / totalRelevant : 0;
}

// ============================================================================
// Daily Summary
// ============================================================================

function buildDailySummary(sessions, entries, localDate) {
  const dateSessions = sessions.filter(s => s.localDate === localDate);
  const dateEntries = entries.filter(e => e.localDate === localDate);
  const included = normalizeSessions(dateSessions);
  const { appActiveSeconds, webActiveSeconds } = calculateAppWebBreakdown(included);

  return {
    localDate,
    detectedSessionCount: included.length,
    pendingSessionCount: included.filter(s => s.status === SessionStatus.PENDING).length,
    completedSessionCount: included.filter(s => s.status === SessionStatus.COMPLETED).length,
    suspectedSessionCount: included.filter(s => s.status === SessionStatus.SUSPECTED).length,
    grossActiveSeconds: calculateGrossActiveSeconds(included),
    dedupedActiveSeconds: calculateDedupedActiveSeconds(included),
    appActiveSeconds,
    webActiveSeconds,
    promptCount: included.reduce((sum, s) => sum + (s.promptCount || 0), 0),
    completionRate: calculateCompletionRate(dateSessions, dateEntries),
    updatedAt: new Date().toISOString(),
  };
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    normalizeSessions,
    mergeAdjacentSessions,
    calculateGrossActiveSeconds,
    calculateDedupedActiveSeconds,
    calculateToolDistribution,
    calculateSourceDistribution,
    calculateAppWebBreakdown,
    calculateCompletionRate,
    buildDailySummary,
    isIncluded,
  });
}
