/**
 * @fileoverview Session management for Murmur Browser Extension.
 * Converts raw browsing events into structured DetectedSessions.
 * Handles session lifecycle: start, pause, resume, end, merge, discard.
 */

// ============================================================================
// In-memory state (rehydrated on service worker restart)
// ============================================================================

/**
 * Map of domain → active session.
 * @type {Map<string, import('../shared/types.js').DetectedSession>}
 */
let activeSessions = new Map();

/**
 * Map of domain → timer handle for pause-to-suspect timer.
 * @type {Map<string, number>}
 */
let pauseTimers = new Map();

/**
 * Map of domain → timer handle for inactivity timeout.
 * @type {Map<string, number>}
 */
let inactivityTimers = new Map();

/**
 * Current settings (loaded from storage).
 * @type {import('../shared/types.js').MurmurSettings}
 */
let settings = null;

/**
 * Map of domain → associated tool (for non-tool-detected pages that were on AI sites).
 * @type {Map<string, import('../shared/types.js').ToolCatalogItem>}
 */
let domainToolMap = new Map();

// ============================================================================
// Initialization
// ============================================================================

/**
 * Load settings from storage and rehydrate active sessions.
 * Called on service worker startup.
 * @returns {Promise<void>}
 */
async function initSessionizer() {
  settings = await getSettings();
  const stored = await getActiveSession();
  if (stored && stored.endTime === null) {
    // Recovered session — it was active when SW terminated
    // Mark as needing user attention (might have been idle-killed)
    stored.status = SessionStatus.NEEDS_COMPLETION;
    stored.endTime = Date.now();
    stored.duration = Math.floor((stored.endTime - stored.startTime) / 1000);
    await saveSession(stored);
    console.log('[Murmur Sessionizer] Recovered and finalized session:', stored.id);
  }
}

/**
 * Reload settings (called when settings change).
 * @returns {Promise<void>}
 */
async function reloadSettings() {
  settings = await getSettings();
}

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * Start a new session for the given tool and domain.
 * @param {import('../shared/types.js').ToolCatalogItem} tool
 * @param {string} domain
 * @param {import('../shared/types.js').RawEvent} event
 * @param {string} cleanUrl — hostname + path only
 * @returns {import('../shared/types.js').DetectedSession}
 */
function startSession(tool, domain, event, cleanUrl) {
  const now = Date.now();
  const sessionId = generateUUID();

  /** @type {import('../shared/types.js').DetectedSession} */
  const session = {
    id: sessionId,
    toolId: tool.id,
    toolName: tool.name,
    domain: domain,
    url: cleanUrl,
    startTime: now,
    endTime: null,
    duration: 0,
    promptCount: null,
    status: SessionStatus.PAUSED, // Will be set to active once focus confirmed
    source: toolIdToPlatform(tool.id),
    detectionStatus: DetectionStatus.AUTO,
    confidence: tool.confidence.domain,
    tags: [],
    notes: null,
    createdAt: now,
    updatedAt: now,
  };

  activeSessions.set(domain, session);
  domainToolMap.set(domain, tool);

  // Save to storage via background (for recovery)
  saveActiveSession(session);

  console.log('[Murmur Sessionizer] Session started:', tool.name, domain, sessionId);
  return session;
}

/**
 * Resume a paused session (tab/window refocused).
 * @param {string} domain
 * @returns {import('../shared/types.js').DetectedSession|null}
 */
function resumeSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;

  // Clear any pending pause timer
  const timer = pauseTimers.get(domain);
  if (timer) {
    clearTimeout(timer);
    pauseTimers.delete(domain);
  }

  // Only resume if actually paused
  if (session.status === SessionStatus.PAUSED) {
    session.status = SessionStatus.PAUSED; // stays paused until we confirm active focus
    session.updatedAt = Date.now();
  }

  return session;
}

/**
 * Set a session as actively being used (user is on the page).
 * @param {string} domain
 * @returns {import('../shared/types.js').DetectedSession|null}
 */
function activateSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;

  session.status = SessionStatus.PAUSED; // will be completed on end
  session.updatedAt = Date.now();

  // Clear inactivity timer
  const timer = inactivityTimers.get(domain);
  if (timer) {
    clearTimeout(timer);
    inactivityTimers.delete(domain);
  }

  return session;
}

/**
 * Pause a session (window blurred or tab switched away).
 * @param {string} domain
 * @returns {import('../shared/types.js').DetectedSession|null}
 */
function pauseSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;

  session.status = SessionStatus.PAUSED;
  session.updatedAt = Date.now();

  // Set timer to auto-end session after suspected threshold
  clearAutoPauseTimer(domain);
  const timeoutMs = (settings?.suspectedThresholdSeconds || 30) * 1000;
  const timer = setTimeout(() => {
    handleSuspectedAbandon(domain);
  }, timeoutMs);
  pauseTimers.set(domain, timer);

  return session;
}

/**
 * Handle suspected abandonment — user hasn't returned within threshold.
 * @param {string} domain
 */
function handleSuspectedAbandon(domain) {
  const session = activeSessions.get(domain);
  if (!session) return;

  const now = Date.now();
  const elapsedSeconds = Math.floor((now - session.startTime) / 1000);
  const minSeconds = settings?.minSessionSeconds || 15;

  if (elapsedSeconds < minSeconds) {
    // Too short — discard
    console.log('[Murmur Sessionizer] Discarding short session:', session.id, elapsedSeconds + 's');
    activeSessions.delete(domain);
    domainToolMap.delete(domain);
    saveActiveSession(null);
    return;
  }

  // Mark as suspected abandoned
  session.status = SessionStatus.SUSPECTED_ABANDONED;
  session.endTime = now;
  session.duration = elapsedSeconds;
  session.updatedAt = now;

  // Save to storage
  saveSession({ ...session });
  activeSessions.delete(domain);
  domainToolMap.delete(domain);
  saveActiveSession(null);

  console.log('[Murmur Sessionizer] Session suspected abandoned:', session.id, session.duration + 's');
}

/**
 * End a session normally (user navigated away, closed tab, etc).
 * @param {string} domain
 * @returns {Promise<import('../shared/types.js').DetectedSession|null>}
 */
async function endSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;

  const now = Date.now();
  const elapsedSeconds = Math.floor((now - session.startTime) / 1000);
  const minSeconds = settings?.minSessionSeconds || 15;

  // Clear any timers
  clearAutoPauseTimer(domain);

  if (elapsedSeconds < minSeconds) {
    // Too short — discard
    console.log('[Murmur Sessionizer] Discarding short session:', session.id, elapsedSeconds + 's');
    activeSessions.delete(domain);
    domainToolMap.delete(domain);
    saveActiveSession(null);
    return null;
  }

  // Finalize
  session.endTime = now;
  session.duration = elapsedSeconds;
  const isSuspected = elapsedSeconds < (settings?.suspectedThresholdSeconds || 30);
  session.status = isSuspected
    ? SessionStatus.SUSPECTED_ABANDONED
    : SessionStatus.COMPLETED;
  session.updatedAt = now;

  // Check for adjacent merge
  await checkAndMergeAdjacent(session);

  // Save finalized session
  await saveSession({ ...session });
  activeSessions.delete(domain);
  domainToolMap.delete(domain);
  saveActiveSession(null);

  console.log('[Murmur Sessionizer] Session ended:', session.toolName, domain, session.duration + 's', session.status);
  return session;
}

/**
 * End session immediately and mark as needing user completion.
 * Used for the popup's "quick complete" button.
 * @param {string} domain
 * @returns {Promise<import('../shared/types.js').DetectedSession|null>}
 */
async function quickEndSession(domain) {
  const session = activeSessions.get(domain);
  if (!session) return null;

  const now = Date.now();
  clearAutoPauseTimer(domain);

  session.endTime = now;
  session.duration = Math.floor((now - session.startTime) / 1000);
  session.status = SessionStatus.NEEDS_COMPLETION;
  session.updatedAt = now;

  await saveSession({ ...session });
  activeSessions.delete(domain);
  domainToolMap.delete(domain);
  saveActiveSession(null);

  return session;
}

/**
 * Clear the auto-pause timer for a domain.
 * @param {string} domain
 */
function clearAutoPauseTimer(domain) {
  const timer = pauseTimers.get(domain);
  if (timer) {
    clearTimeout(timer);
    pauseTimers.delete(domain);
  }
}

// ============================================================================
// Adjacent Session Merging
// ============================================================================

/**
 * Check if two adjacent sessions (same tool) should be merged.
 * Merges sessions within mergeWindowMinutes of each other.
 * @param {import('../shared/types.js').DetectedSession} session — the just-ended session
 * @returns {Promise<void>}
 */
async function checkAndMergeAdjacent(session) {
  const mergeWindow = (settings?.mergeWindowMinutes || 3) * 60 * 1000;
  const sessions = await getSessions();

  // Find the most recent completed session for the same tool
  const candidates = sessions
    .filter(
      (s) =>
        s.toolId === session.toolId &&
        s.id !== session.id &&
        s.status !== SessionStatus.MERGED &&
        s.status !== SessionStatus.IGNORED &&
        s.endTime !== null
    )
    .sort((a, b) => b.endTime - a.endTime);

  if (candidates.length === 0) return;

  const lastSession = candidates[0];
  const gap = session.startTime - lastSession.endTime;

  if (gap > 0 && gap <= mergeWindow) {
    // Merge: combine into one session
    console.log('[Murmur Sessionizer] Merging adjacent sessions:', lastSession.id, session.id);

    lastSession.endTime = session.endTime;
    lastSession.duration = lastSession.duration + session.duration;
    lastSession.tags = [...new Set([...lastSession.tags, ...session.tags])];
    lastSession.updatedAt = Date.now();

    // Mark the newer session as merged
    session.status = SessionStatus.MERGED;

    await updateSession(lastSession.id, {
      endTime: lastSession.endTime,
      duration: lastSession.duration,
      tags: lastSession.tags,
      updatedAt: lastSession.updatedAt,
    });
  }
}

// ============================================================================
// Cross-Midnight Splitting
// ============================================================================

/**
 * Check if a session spans across midnight and needs splitting.
 * @param {import('../shared/types.js').DetectedSession} session
 * @returns {boolean}
 */
function crossesMidnight(session) {
  if (!session.endTime) return false;
  const startDay = new Date(session.startTime).toISOString().slice(0, 10);
  const endDay = new Date(session.endTime).toISOString().slice(0, 10);
  return startDay !== endDay;
}

// ============================================================================
// Event Processing
// ============================================================================

/**
 * Process a raw browser event and update session state.
 * This is the main entry point from the detector.
 *
 * @param {import('../shared/types.js').RawEvent} rawEvent
 * @returns {Promise<import('../shared/types.js').DetectedSession|null>}
 */
async function processEvent(rawEvent) {
  // Ensure settings loaded
  if (!settings) {
    await reloadSettings();
  }

  const { eventType, domain, url } = rawEvent;

  // Match against tool catalog
  const match = await matchEvent(rawEvent, settings?.toolState);

  switch (eventType) {
    case EventType.TAB_ACTIVATED:
    case EventType.TAB_UPDATED:
    case EventType.NAVIGATION_COMMITTED: {
      if (match.tool && !match.shouldIgnore) {
        // It's an AI site
        if (activeSessions.has(domain)) {
          // Already tracking this domain — reactivate
          activateSession(domain);
        } else {
          // Start new session
          const cleanUrl = extractCleanUrl(url);
          const cleanUrlStr = cleanUrl ? cleanUrl.full : url;
          startSession(match.tool, domain, rawEvent, cleanUrlStr);
        }
        return activeSessions.get(domain) || null;
      } else {
        // Not an AI site — if we had an active session for this domain, pause it
        if (activeSessions.has(domain)) {
          pauseSession(domain);
        }
      }
      break;
    }

    case EventType.TAB_REMOVED: {
      if (activeSessions.has(domain)) {
        return await endSession(domain);
      }
      break;
    }

    case EventType.WINDOW_FOCUS_CHANGED: {
      if (rawEvent.metadata?.focused === false) {
        // Window lost focus — pause all active
        for (const [d] of activeSessions) {
          pauseSession(d);
        }
      } else {
        // Window gained focus — resume for current domain
        if (activeSessions.has(domain)) {
          resumeSession(domain);
        }
      }
      break;
    }

    case EventType.IDLE_STATE_CHANGED: {
      if (rawEvent.metadata?.state === 'idle') {
        // Browser entered idle — pause all
        for (const [d] of activeSessions) {
          pauseSession(d);
        }
      } else if (rawEvent.metadata?.state === 'active') {
        // Browser became active — resume
        if (activeSessions.has(domain)) {
          resumeSession(domain);
        }
      }
      break;
    }
  }

  return activeSessions.get(domain) || null;
}

/**
 * Get the currently active session for a domain.
 * @param {string} domain
 * @returns {import('../shared/types.js').DetectedSession|null}
 */
function getSessionForDomain(domain) {
  return activeSessions.get(domain) || null;
}

/**
 * Get all currently active sessions.
 * @returns {import('../shared/types.js').DetectedSession[]}
 */
function getActiveSessions() {
  return Array.from(activeSessions.values());
}

/**
 * Flush all active sessions to storage (periodic checkpoint).
 * Sessions remain active in memory; this just updates persistence.
 * @returns {Promise<void>}
 */
async function flushAll() {
  for (const [domain, session] of activeSessions) {
    // Update duration for active sessions
    if (session.endTime === null) {
      session.duration = Math.floor((Date.now() - session.startTime) / 1000);
      session.updatedAt = Date.now();
      await saveActiveSession({ ...session });
    }
  }
  console.log('[Murmur Sessionizer] Flushed', activeSessions.size, 'active sessions');
}

/**
 * End all active sessions (e.g., on extension disable or browser close).
 * @returns {Promise<import('../shared/types.js').DetectedSession[]>}
 */
async function endAllSessions() {
  const ended = [];
  for (const domain of activeSessions.keys()) {
    const session = await endSession(domain);
    if (session) ended.push(session);
  }
  return ended;
}

// Export to global scope for service worker
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    // Initialization
    initSessionizer,
    reloadSettings,
    // Lifecycle
    startSession,
    resumeSession,
    activateSession,
    pauseSession,
    endSession,
    quickEndSession,
    // Query
    getSessionForDomain,
    getActiveSessions,
    // Maintenance
    flushAll,
    endAllSessions,
    processEvent,
    // Adjacent
    checkAndMergeAdjacent,
    crossesMidnight,
  });
}
