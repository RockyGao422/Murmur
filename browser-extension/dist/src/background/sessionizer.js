/**
 * @fileoverview Session management for Murmur Browser Extension.
 * Privacy-first: sessions store domain and urlPattern only, never full URLs.
 * Keyed by "windowId:tabId" to support multiple concurrent AI tabs.
 * activeSeconds uses accumulated delta — background time excluded.
 * Status enums aligned with shared/schemas/detected-session.schema.json.
 */

// SessionState wraps a DetectedSession with active-tracking metadata.
// { session: DetectedSession, isActive: bool, lastActiveStartedAt: string|null, accumulatedSeconds: number }

let activeSessions = new Map();     // "windowId:tabId" → SessionState
let currentActiveKey = null;        // key of the foreground session
let pauseTimers = new Map();        // key → timer
let settings = null;
let deviceId = null;                // per-install UUID, generated once

// ============================================================================
// Helpers
// ============================================================================

function makeKey(windowId, tabId) {
  return `${windowId}:${tabId}`;
}

function parseKey(key) {
  const [w, t] = key.split(':');
  return { windowId: parseInt(w), tabId: parseInt(t) };
}

async function getDeviceId() {
  if (deviceId) return deviceId;
  const stored = await chrome.storage.local.get('murmur_device_id');
  deviceId = stored['murmur_device_id'];
  if (!deviceId) {
    deviceId = generateUUID();
    await chrome.storage.local.set({ 'murmur_device_id': deviceId });
  }
  return deviceId;
}

/**
 * Compute SHA-256 based source fingerprint for idempotent dedup.
 * Uses a simple hash since crypto.subtle may not be available in service worker.
 */
function computeFingerprint(session) {
  const parts = [
    session.sourcePlatform,
    session.sourceKind,
    session.deviceId || '',
    session.toolId,
    session.rawDomain || session.rawBundleId || '',
    Math.floor(new Date(session.startedAt).getTime() / 5000),
    Math.floor(new Date(session.endedAt || session.startedAt).getTime() / 5000),
    session.activeSeconds
  ].join('|');
  // Simple fast hash — enough for local dedup, not cryptographic
  let h = 0;
  for (let i = 0; i < parts.length; i++) {
    h = ((h << 5) - h + parts.charCodeAt(i)) | 0;
  }
  return 'fp-' + Math.abs(h).toString(36);
}

// ============================================================================
// Initialization
// ============================================================================

async function initSessionizer() {
  settings = await getSettings();
  await getDeviceId();
  const stored = await getActiveSession();
  if (!stored) return;

  // Unwrap: support both old format (plain DetectedSession) and new format (wrapper with .session)
  const wrapper = (stored.session && typeof stored.isActive !== 'undefined') ? stored : null;
  const session = wrapper ? wrapper.session : stored;
  const key = wrapper ? wrapper.key : null;
  const accumulatedSeconds = wrapper ? (wrapper.accumulatedSeconds || 0) : 0;

  if (session && !session.endedAt) {
    const now = new Date().toISOString();

    // If wrapper format, add any accumulated time plus pending delta
    if (wrapper && wrapper.isActive && wrapper.lastActiveStartedAt) {
      const delta = Math.floor((Date.now() - new Date(wrapper.lastActiveStartedAt).getTime()) / 1000);
      session.activeSeconds = accumulatedSeconds + Math.max(0, delta);
    } else if (wrapper) {
      session.activeSeconds = accumulatedSeconds;
    } else {
      // Legacy format: compute elapsed from startedAt
      const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
      session.activeSeconds = Math.max(0, elapsed);
    }

    session.endedAt = now;
    session.status = session.activeSeconds < (settings?.suspectedThresholdSeconds || 30)
      ? SessionStatus.SUSPECTED : SessionStatus.PENDING;
    session.updatedAt = now;

    await saveSession(session);
    console.log('[Murmur Sessionizer] Recovered session on restart:', session.id, 'activeSeconds:', session.activeSeconds);
  }
}

async function reloadSettings() {
  settings = await getSettings();
}

// ============================================================================
// Session Construction (aligned with shared schema)
// ============================================================================

function makeSession(id, tool, domain, urlPattern, startedAt, confidence) {
  const d = new Date(startedAt);
  const localDate = d.toLocaleDateString('en-CA');
  const hour = d.getHours();
  return {
    id,
    sourcePlatform: SourcePlatform.BROWSER,
    sourceKind: SourceKind.WEB,
    detectorId: 'browser.extension',
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
    deviceId: deviceId || '',
    sourceSessionId: null,
    sourceFingerprint: null,
    syncStatus: SyncStatus.LOCAL_ONLY,
    syncedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

// ============================================================================
// Session Lifecycle (accumulated-delta activeSeconds)
// ============================================================================

function startSession(tool, domain, event, urlPattern) {
  const now = new Date().toISOString();
  const sessionId = generateUUID();
  const session = makeSession(sessionId, tool, domain, urlPattern, now, tool.confidence?.domain || 0.95);
  const key = makeKey(event.windowId, event.tabId);

  const state = {
    session,
    isActive: true,
    lastActiveStartedAt: now,
    accumulatedSeconds: 0,
  };

  activeSessions.set(key, state);
  saveActiveSession({ key, ...state, lastActiveStartedAt: state.lastActiveStartedAt });
  console.log('[Murmur Sessionizer] Started:', tool.name, domain, sessionId, 'key:', key);
  return session;
}

function resumeSession(key) {
  const state = activeSessions.get(key);
  if (!state) return null;
  const timer = pauseTimers.get(key);
  if (timer) { clearTimeout(timer); pauseTimers.delete(key); }
  state.session.updatedAt = new Date().toISOString();
  return state;
}

/**
 * Activate a session (tab becomes foreground).
 * Records the time so we can later compute the delta.
 */
function activateSession(key) {
  const state = activeSessions.get(key);
  if (!state) return null;
  state.isActive = true;
  state.lastActiveStartedAt = new Date().toISOString();
  state.session.updatedAt = new Date().toISOString();
  return state;
}

/**
 * Pause a session (tab goes to background / window loses focus).
 * Accumulates the delta since last activation.
 */
function pauseSession(key) {
  const state = activeSessions.get(key);
  if (!state) return null;

  if (state.isActive && state.lastActiveStartedAt) {
    const delta = Math.floor((Date.now() - new Date(state.lastActiveStartedAt).getTime()) / 1000);
    if (delta > 0) {
      state.accumulatedSeconds += delta;
    }
  }

  state.isActive = false;
  state.lastActiveStartedAt = null;
  state.session.updatedAt = new Date().toISOString();

  clearAutoPauseTimer(key);
  const timeoutMs = (settings?.suspectedThresholdSeconds || 30) * 1000;
  const timer = setTimeout(() => handleSuspectedAbandon(key), timeoutMs);
  pauseTimers.set(key, timer);
  return state;
}

function handleSuspectedAbandon(key) {
  const state = activeSessions.get(key);
  if (!state) return;

  // Finalize accumulated time
  if (state.isActive && state.lastActiveStartedAt) {
    const delta = Math.floor((Date.now() - new Date(state.lastActiveStartedAt).getTime()) / 1000);
    if (delta > 0) state.accumulatedSeconds += delta;
  }

  const minSeconds = settings?.minSessionSeconds || 15;
  if (state.accumulatedSeconds < minSeconds) {
    activeSessions.delete(key);
    saveActiveSession(null);
    return;
  }

  state.session.activeSeconds = state.accumulatedSeconds;
  state.session.endedAt = new Date().toISOString();
  state.session.status = SessionStatus.SUSPECTED;
  state.session.updatedAt = new Date().toISOString();
  state.session.sourceFingerprint = computeFingerprint(state.session);

  saveSession({ ...state.session });
  activeSessions.delete(key);
  if (currentActiveKey === key) currentActiveKey = null;
  saveActiveSession(null);
}

/**
 * Finalize a session — compute final activeSeconds, save, remove from active map.
 */
async function endSession(key) {
  const state = activeSessions.get(key);
  if (!state) return null;

  // Finalize accumulated time
  if (state.isActive && state.lastActiveStartedAt) {
    const delta = Math.floor((Date.now() - new Date(state.lastActiveStartedAt).getTime()) / 1000);
    if (delta > 0) state.accumulatedSeconds += delta;
  }

  clearAutoPauseTimer(key);

  const minSeconds = settings?.minSessionSeconds || 15;
  if (state.accumulatedSeconds < minSeconds) {
    activeSessions.delete(key);
    if (currentActiveKey === key) currentActiveKey = null;
    saveActiveSession(null);
    return null;
  }

  const now = new Date().toISOString();
  state.session.activeSeconds = state.accumulatedSeconds;
  state.session.endedAt = now;
  const isShort = state.accumulatedSeconds < (settings?.suspectedThresholdSeconds || 30);
  state.session.status = isShort ? SessionStatus.SUSPECTED : SessionStatus.PENDING;
  state.session.updatedAt = now;
  state.session.sourceFingerprint = computeFingerprint(state.session);

  await checkAndMergeAdjacent(state.session);
  await saveSession({ ...state.session });
  activeSessions.delete(key);
  if (currentActiveKey === key) currentActiveKey = null;
  saveActiveSession(null);
  return state.session;
}

async function quickEndSession(key) {
  const state = activeSessions.get(key);
  if (!state) return null;

  if (state.isActive && state.lastActiveStartedAt) {
    const delta = Math.floor((Date.now() - new Date(state.lastActiveStartedAt).getTime()) / 1000);
    if (delta > 0) state.accumulatedSeconds += delta;
  }

  clearAutoPauseTimer(key);

  const now = new Date().toISOString();
  state.session.activeSeconds = Math.max(1, state.accumulatedSeconds);
  state.session.endedAt = now;
  state.session.status = SessionStatus.PENDING;
  state.session.updatedAt = now;
  state.session.sourceFingerprint = computeFingerprint(state.session);

  await saveSession({ ...state.session });
  activeSessions.delete(key);
  if (currentActiveKey === key) currentActiveKey = null;
  saveActiveSession(null);
  return state.session;
}

function clearAutoPauseTimer(key) {
  const timer = pauseTimers.get(key);
  if (timer) { clearTimeout(timer); pauseTimers.delete(key); }
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
  return new Date(session.startedAt).toLocaleDateString('en-CA') !==
         new Date(session.endedAt).toLocaleDateString('en-CA');
}

// ============================================================================
// Event Processing (keyed by windowId:tabId)
// ============================================================================

/**
 * Map internal browser event types to canonical event types.
 * WINDOW_FOCUS_CHANGED maps based on focused flag.
 */
function toCanonicalEventType(internalType, metadata) {
  if (internalType === EventType.WINDOW_FOCUS_CHANGED) {
    return metadata?.focused === false ? CanonicalEventType.TAB_INACTIVE : CanonicalEventType.TAB_ACTIVE;
  }
  return EVENT_TYPE_TO_CANONICAL[internalType] || internalType;
}

async function processEvent(rawEvent) {
  if (!settings) await reloadSettings();

  const { eventType, domain, urlPattern, tabId, windowId } = rawEvent;
  const eventKey = makeKey(windowId, tabId);
  const match = await matchEvent(rawEvent, settings?.toolState);

  switch (eventType) {
    case EventType.TAB_ACTIVATED:
    case EventType.NAVIGATION_COMMITTED: {
      // Pause previous foreground session
      if (currentActiveKey && currentActiveKey !== eventKey) {
        pauseSession(currentActiveKey);
      }

      if (match.tool && !match.shouldIgnore) {
        if (activeSessions.has(eventKey)) {
          // Same tab — check if tool changed (navigation to a different AI site)
          const existingToolId = activeSessions.get(eventKey).session.toolId;
          if (existingToolId !== match.tool.id) {
            // Tool changed: end old session, start new one
            await endSession(eventKey);
            startSession(match.tool, domain, rawEvent, urlPattern);
          } else if (!activeSessions.get(eventKey).isActive) {
            activateSession(eventKey);
          }
          currentActiveKey = eventKey;
        } else {
          startSession(match.tool, domain, rawEvent, urlPattern);
          currentActiveKey = eventKey;
        }
        return activeSessions.get(eventKey)?.session || null;
      } else {
        // Not an AI site — if this key had a session, pause it
        if (activeSessions.has(eventKey)) {
          pauseSession(eventKey);
        }
      }
      break;
    }

    case EventType.TAB_UPDATED: {
      // URL change on active tab
      if (match.tool && !match.shouldIgnore) {
        if (activeSessions.has(eventKey)) {
          const existingToolId = activeSessions.get(eventKey).session.toolId;
          if (existingToolId !== match.tool.id) {
            // Tool changed: end old session, start new one
            await endSession(eventKey);
            startSession(match.tool, domain, rawEvent, urlPattern);
          } else if (!activeSessions.get(eventKey).isActive) {
            activateSession(eventKey);
          }
          currentActiveKey = eventKey;
        } else {
          startSession(match.tool, domain, rawEvent, urlPattern);
          currentActiveKey = eventKey;
        }
      } else if (activeSessions.has(eventKey)) {
        // Navigated away from AI — end this session
        await endSession(eventKey);
      }
      break;
    }

    case EventType.TAB_REMOVED:
      if (activeSessions.has(eventKey)) {
        return await endSession(eventKey);
      }
      break;

    case EventType.WINDOW_FOCUS_CHANGED:
      if (rawEvent.metadata?.focused === false) {
        // Window lost focus — pause current active
        if (currentActiveKey && activeSessions.has(currentActiveKey)) {
          pauseSession(currentActiveKey);
        }
      } else {
        // Window gained focus — reactivate if the active tab is AI
        if (currentActiveKey && activeSessions.has(currentActiveKey)) {
          activateSession(currentActiveKey);
        }
      }
      break;
  }

  return activeSessions.get(eventKey)?.session || null;
}

// ============================================================================
// Query Helpers
// ============================================================================

function getSessionForKey(key) {
  return activeSessions.get(key)?.session || null;
}

function getSessionForDomain(domain) {
  for (const [key, state] of activeSessions) {
    if (state.session.rawDomain === domain) return state.session;
  }
  return null;
}

function getActiveSessions() {
  return Array.from(activeSessions.values()).map(s => s.session);
}

function getActiveSessionCount() {
  return activeSessions.size;
}

// ============================================================================
// Flush & Persist
// ============================================================================

async function flushAll() {
  const now = new Date().toISOString();
  for (const [key, state] of activeSessions) {
    // Accumulate any pending delta
    if (state.isActive && state.lastActiveStartedAt) {
      const delta = Math.floor((Date.now() - new Date(state.lastActiveStartedAt).getTime()) / 1000);
      if (delta > 0) state.accumulatedSeconds += delta;
      state.lastActiveStartedAt = now;
    }
    state.session.activeSeconds = state.accumulatedSeconds;
    state.session.updatedAt = now;
    await saveActiveSession({ key, ...state, lastActiveStartedAt: state.lastActiveStartedAt });
  }
}

async function endAllSessions() {
  const ended = [];
  for (const key of activeSessions.keys()) {
    const session = await endSession(key);
    if (session) ended.push(session);
  }
  return ended;
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    initSessionizer, reloadSettings,
    startSession, resumeSession, activateSession, pauseSession, endSession, quickEndSession,
    getSessionForKey, getSessionForDomain, getActiveSessions, getActiveSessionCount,
    flushAll, endAllSessions, processEvent,
    checkAndMergeAdjacent, crossesMidnight,
    computeFingerprint, toCanonicalEventType, getDeviceId,
    makeKey, currentActiveKey,
  });
}
