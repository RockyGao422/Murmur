/**
 * @fileoverview Session management for Murmur Browser Extension.
 * Privacy-first: sessions store domain and urlPattern only, never full URLs.
 * Status enums aligned with shared/schemas/detected-session.schema.json.
 */

let activeSessions = new Map();     // domain → session
let pauseTimers = new Map();        // domain → timer
let domainToolMap = new Map();      // domain → tool
let settings = null;

// ============================================================================
// Initialization
// ============================================================================

async function initSessionizer() {
  settings = await getSettings();
  const stored = await getActiveSession();
  if (stored && !stored.endedAt) {
    stored.endedAt = new Date().toISOString();
    const elapsed = Math.floor((Date.now() - new Date(stored.startedAt).getTime()) / 1000);
    stored.activeSeconds = Math.max(0, elapsed);
    stored.status = stored.activeSeconds < (settings?.suspectedThresholdSeconds || 30)
      ? SessionStatus.SUSPECTED : SessionStatus.PENDING;
    stored.updatedAt = new Date().toISOString();
    await saveSession(stored);
  }
}

async function reloadSettings() {
  settings = await getSettings();
}

// ============================================================================
// Session Construction (aligned with shared schema)
// ============================================================================

/**
 * @param {string} id
 * @param {Object} tool
 * @param {string} domain
 * @param {string|null} urlPattern
 * @param {string} startedAt — ISO 8601
 * @param {number} confidence
 * @returns {Object} session matching DetectedSession schema
 */
function makeSession(id, tool, domain, urlPattern, startedAt, confidence) {
  const d = new Date(startedAt);
  const localDate = d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const hour = d.getHours();
  return {
    id,
    sourcePlatform: SourcePlatform.BROWSER,
    sourceKind: SourceKind.WEB,
    detectorId: 'browser.tabs',
    toolId: tool.id,
    toolName: tool.name,
    rawAppName: null,
    rawBundleId: null,
    rawPackageName: null,
    rawDomain: domain,
    rawUrlPattern: urlPattern || `${domain}/*`,
    windowTitleHash: null,
    startedAt,
    endedAt: null,
    activeSeconds: 0,
    idleSeconds: 0,
    localDate,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    isNight: hour >= 22 || hour < 6,
    confidence,
    status: SessionStatus.PENDING,
    mergedIntoSessionId: null,
    promptCount: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

// ============================================================================
// Session Lifecycle
// ============================================================================

function startSession(tool, domain, event, urlPattern) {
  const now = new Date().toISOString();
  const sessionId = generateUUID();
  const session = makeSession(sessionId, tool, domain, urlPattern, now, tool.confidence?.domain || 0.95);

  activeSessions.set(domain, session);
  domainToolMap.set(domain, tool);
  saveActiveSession(session);
  console.log('[Murmur Sessionizer] Started:', tool.name, domain, sessionId);
  return session;
}

function resumeSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;
  const timer = pauseTimers.get(domain);
  if (timer) { clearTimeout(timer); pauseTimers.delete(domain); }
  session.updatedAt = new Date().toISOString();
  return session;
}

function activateSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;
  session.updatedAt = new Date().toISOString();
  return session;
}

function pauseSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;
  session.updatedAt = new Date().toISOString();
  clearAutoPauseTimer(domain);
  const timeoutMs = (settings?.suspectedThresholdSeconds || 30) * 1000;
  const timer = setTimeout(() => handleSuspectedAbandon(domain), timeoutMs);
  pauseTimers.set(domain, timer);
  return session;
}

function handleSuspectedAbandon(domain) {
  const session = activeSessions.get(domain);
  if (!session) return;
  const now = new Date();
  const startedAt = new Date(session.startedAt);
  const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  const minSeconds = settings?.minSessionSeconds || 15;

  if (elapsedSeconds < minSeconds) {
    activeSessions.delete(domain);
    domainToolMap.delete(domain);
    saveActiveSession(null);
    return;
  }

  session.endedAt = now.toISOString();
  session.activeSeconds = elapsedSeconds;
  session.status = SessionStatus.SUSPECTED;
  session.updatedAt = now.toISOString();
  saveSession({ ...session });
  activeSessions.delete(domain);
  domainToolMap.delete(domain);
  saveActiveSession(null);
}

async function endSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;
  const now = new Date();
  const startedAt = new Date(session.startedAt);
  const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  const minSeconds = settings?.minSessionSeconds || 15;

  clearAutoPauseTimer(domain);

  if (elapsedSeconds < minSeconds) {
    activeSessions.delete(domain);
    domainToolMap.delete(domain);
    saveActiveSession(null);
    return null;
  }

  session.endedAt = now.toISOString();
  session.activeSeconds = elapsedSeconds;
  const isShort = elapsedSeconds < (settings?.suspectedThresholdSeconds || 30);
  session.status = isShort ? SessionStatus.SUSPECTED : SessionStatus.PENDING;
  session.updatedAt = now.toISOString();

  await checkAndMergeAdjacent(session);
  await saveSession({ ...session });
  activeSessions.delete(domain);
  domainToolMap.delete(domain);
  saveActiveSession(null);
  return session;
}

async function quickEndSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;
  const now = new Date();
  clearAutoPauseTimer(domain);
  const startedAt = new Date(session.startedAt);
  session.endedAt = now.toISOString();
  session.activeSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  session.status = SessionStatus.PENDING;
  session.updatedAt = now.toISOString();
  await saveSession({ ...session });
  activeSessions.delete(domain);
  domainToolMap.delete(domain);
  saveActiveSession(null);
  return session;
}

function clearAutoPauseTimer(domain) {
  const timer = pauseTimers.get(domain);
  if (timer) { clearTimeout(timer); pauseTimers.delete(domain); }
}

// ============================================================================
// Adjacent Merge
// ============================================================================

async function checkAndMergeAdjacent(session) {
  const mergeWindowMs = (settings?.mergeWindowMinutes || 3) * 60 * 1000;
  const sessions = await getSessions();
  const candidates = sessions
    .filter(s => s.toolId === session.toolId && s.id !== session.id &&
                  s.status !== SessionStatus.MERGED && s.status !== SessionStatus.IGNORED && s.endedAt)
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
  if (candidates.length === 0) return;

  const lastSession = candidates[0];
  const gap = new Date(session.startedAt).getTime() - new Date(lastSession.endedAt).getTime();
  if (gap > 0 && gap <= mergeWindowMs) {
    const now = new Date().toISOString();
    lastSession.endedAt = session.endedAt;
    lastSession.activeSeconds = (lastSession.activeSeconds || 0) + (session.activeSeconds || 0);
    lastSession.updatedAt = now;
    session.status = SessionStatus.MERGED;
    await updateSession(lastSession.id, {
      endedAt: lastSession.endedAt, activeSeconds: lastSession.activeSeconds, updatedAt: lastSession.updatedAt,
    });
  }
}

function crossesMidnight(session) {
  if (!session.endedAt) return false;
  return new Date(session.startedAt).toISOString().slice(0, 10) !==
         new Date(session.endedAt).toISOString().slice(0, 10);
}

// ============================================================================
// Event Processing
// ============================================================================

async function processEvent(rawEvent) {
  if (!settings) await reloadSettings();

  const { eventType, domain, urlPattern } = rawEvent;
  const match = await matchEvent(rawEvent, settings?.toolState);

  switch (eventType) {
    case EventType.TAB_ACTIVATED:
    case EventType.TAB_UPDATED:
    case EventType.NAVIGATION_COMMITTED: {
      // If user navigated away from a previous domain, pause/end its session
      const prevDomain = rawEvent.metadata?.previousDomain;
      if (prevDomain && prevDomain !== domain && activeSessions.has(prevDomain)) {
        // End the old session if it's an AI site that we're leaving
        const prevMatch = isAIDomain(prevDomain) ? await matchEvent(
          { domain: prevDomain, urlPattern: prevDomain + '/*' }, settings?.toolState
        ) : { tool: null, shouldIgnore: false };
        if (prevMatch.tool) {
          await endSession(prevDomain);
        }
      }

      if (match.tool && !match.shouldIgnore) {
        if (activeSessions.has(domain)) {
          activateSession(domain);
        } else {
          startSession(match.tool, domain, rawEvent, urlPattern);
        }
        return activeSessions.get(domain) || null;
      } else {
        if (activeSessions.has(domain)) pauseSession(domain);
      }
      break;
    }

    case EventType.TAB_REMOVED:
      if (activeSessions.has(domain)) return await endSession(domain);
      break;

    case EventType.WINDOW_FOCUS_CHANGED:
      if (rawEvent.metadata?.focused === false) {
        for (const [d] of activeSessions) pauseSession(d);
      } else {
        if (activeSessions.has(domain)) resumeSession(domain);
      }
      break;
  }

  return activeSessions.get(domain) || null;
}

function getSessionForDomain(domain) { return activeSessions.get(domain) || null; }
function getActiveSessions() { return Array.from(activeSessions.values()); }

async function flushAll() {
  const now = new Date().toISOString();
  for (const [, session] of activeSessions) {
    if (!session.endedAt) {
      const startedAt = new Date(session.startedAt);
      session.activeSeconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      session.updatedAt = now;
      await saveActiveSession({ ...session });
    }
  }
}

async function endAllSessions() {
  const ended = [];
  for (const domain of activeSessions.keys()) {
    const session = await endSession(domain);
    if (session) ended.push(session);
  }
  return ended;
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    initSessionizer, reloadSettings,
    startSession, resumeSession, activateSession, pauseSession, endSession, quickEndSession,
    getSessionForDomain, getActiveSessions,
    flushAll, endAllSessions, processEvent,
    checkAndMergeAdjacent, crossesMidnight,
  });
}
