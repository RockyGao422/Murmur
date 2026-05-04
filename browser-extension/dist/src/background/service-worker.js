/**
 * @fileoverview Murmur Browser Extension — Background Service Worker.
 * Main entry point for Manifest V3 service worker.
 * Imports all modules via importScripts, manages lifecycle,
 * sets up alarms, and handles popup communication.
 */

// ============================================================================
// Import all modules (Manifest V3 service workers use importScripts)
// ============================================================================

// Note: In Manifest V3, importScripts MUST be at the top level.
// The paths are relative to the service worker file location.
try {
  importScripts(
    '../shared/types.js',
    '../shared/enums.js',
    '../shared/tool-catalog.js',
    '../shared/storage.js',
    '../aggregation/session-aggregator.js',
    'tool-matcher.js',
    'sessionizer.js',
    'detector.js',
    'native-messaging.js'
  );
} catch (err) {
  console.error('[Murmur SW] Failed to load modules:', err);
}

// ============================================================================
// Constants
// ============================================================================

const ALARM_FLUSH = 'murmur-flush';
const ALARM_IDLE_CHECK = 'murmur-idle-check';
const ALARM_SYNC_RETRY = 'murmur-sync-retry';
const FLUSH_INTERVAL_MINUTES = 5;
const IDLE_CHECK_INTERVAL_MINUTES = 10;
const SYNC_RETRY_INTERVAL_MINUTES = 5;
const KEEPALIVE_INTERVAL_SECONDS = 20;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the service worker.
 * Run on install and on each wake-up.
 * @returns {Promise<void>}
 */
async function initialize() {
  console.log('[Murmur SW] Initializing...');

  try {
    // Load settings
    const settings = await getSettings();

    // Initialize sessionizer (rehydrates state)
    await initSessionizer();

    // Start detection
    await startDetection();

    console.log('[Murmur SW] Initialized successfully');
    console.log('[Murmur SW] Settings:', JSON.stringify({
      toolCount: Object.keys(settings.toolState || {}).length,
      promptCounting: settings.promptCountingEnabled,
      idleDetection: settings.idleDetectionEnabled,
    }));
  } catch (err) {
    console.error('[Murmur SW] Initialization error:', err);
  }
}

// ============================================================================
// Keep-Alive
// ============================================================================

/**
 * Keep the service worker alive during active detection.
 * Uses chrome.alarms to wake up the SW every 20 seconds.
 * This prevents the SW from being terminated during active use.
 */
function startKeepAlive() {
  chrome.alarms.create('murmur-keepalive', {
    periodInMinutes: KEEPALIVE_INTERVAL_SECONDS / 60,
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'murmur-keepalive') {
      // Just a heartbeat — keeps SW alive
      const activeSessions = getActiveSessions();
      if (activeSessions.length > 0) {
        // Flush state to storage for recovery
        flushAll().catch((err) => {
          console.error('[Murmur SW] Keepalive flush error:', err);
        });
      }
    }
  });
}

// ============================================================================
// Alarms
// ============================================================================

/**
 * Set up periodic flush alarm.
 * Every 5 minutes, flush active sessions to storage.
 */
function setupFlushAlarm() {
  chrome.alarms.create(ALARM_FLUSH, {
    periodInMinutes: FLUSH_INTERVAL_MINUTES,
  });
}

function setupSyncRetryAlarm() {
  chrome.alarms.create(ALARM_SYNC_RETRY, {
    periodInMinutes: SYNC_RETRY_INTERVAL_MINUTES,
  });
}

// Combined alarm listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_FLUSH) {
    flushAll().catch((err) => {
      console.error('[Murmur SW] Flush alarm error:', err);
    });
  }
  if (alarm.name === ALARM_SYNC_RETRY) {
    retryPendingSyncs().catch((err) => {
      console.error('[Murmur SW] Sync retry error:', err);
    });
  }
});

// ============================================================================
// Installation
// ============================================================================

/**
 * Handle extension installation and update.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Murmur SW] onInstalled:', details.reason);

  if (details.reason === 'install') {
    // First install — set up default settings
    const settings = await getSettings();

    // Initialize tool state for all catalog tools
    settings.toolState = {};
    for (const tool of TOOL_CATALOG) {
      if (tool.web_domains.length > 0) {
        settings.toolState[tool.id] = { enabled: tool.default_enabled };
      }
    }

    await saveSettings(settings);

    // Show a welcome notification or open onboarding
    console.log('[Murmur SW] First install — welcome!');

    // Open options page for initial setup
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('src/options/options.html'),
        active: true,
      });
    } catch (err) {
      console.warn('[Murmur SW] Could not open options page:', err);
    }
  } else if (details.reason === 'update') {
    // Handle update — merge new tools into settings
    const settings = await getSettings();
    if (!settings.toolState) settings.toolState = {};

    for (const tool of TOOL_CATALOG) {
      if (tool.web_domains.length > 0 && !(tool.id in settings.toolState)) {
        settings.toolState[tool.id] = { enabled: tool.default_enabled };
      }
    }

    await saveSettings(settings);
    console.log('[Murmur SW] Updated to version', chrome.runtime.getManifest().version);
  }

  // Start everything
  await initialize();
  setupFlushAlarm();
  setupSyncRetryAlarm();
  startKeepAlive();
  tryConnectNativeMessaging();
});

// ============================================================================
// Service Worker Lifecycle
// ============================================================================

/**
 * Handle service worker startup.
 * This fires both on install and on wake-up after termination.
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Murmur SW] Browser startup — initializing');
  await initialize();
  setupFlushAlarm();
  setupSyncRetryAlarm();
  startKeepAlive();
  tryConnectNativeMessaging();
});

// Also initialize immediately (for non-install wake-ups)
// The onInstalled handler already triggers initialize for first install.
// For subsequent wake-ups, we need to check if we're already running.
(async function startupCheck() {
  // Check if we were already initialized (e.g., onInstalled ran first)
  if (typeof detectionActive === 'undefined' || !detectionActive) {
    await initialize();
    setupFlushAlarm();
    startKeepAlive();
    tryConnectNativeMessaging();
  }
})();

// ============================================================================
// Message Handling (Popup Communication)
// ============================================================================

/**
 * Handle messages from popup and options pages.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Use async handler pattern
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error('[Murmur SW] Message handler error:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true; // Keep channel open for async response
});

/**
 * Route incoming messages to appropriate handlers.
 * @param {Object} message
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<Object>}
 */
async function handleMessage(message, sender) {
  const { action, payload } = message;

  switch (action) {
    // ========================================================================
    // Status queries
    // ========================================================================
    case 'getStatus': {
      const session = getCurrentSession();
      const isAI = isOnAISite();
      const tabInfo = getCurrentTabInfo();
      const isPaused = isDetectionPaused();
      const activeSessions = getActiveSessions();

      // Get today's summary
      const today = new Date().toLocaleDateString('en-CA');
      const todaySessions = await getSessionsByDate(today);
      const todayEntries = await getEntriesByDate(today);
      const todaySummary = await getTodaySummary();

      const totalDuration = todaySessions.reduce((sum, s) => sum + (s.activeSeconds || s.duration || 0), 0);
      const pendingCount = todaySessions.filter(
        (s) => s.status === SessionStatus.PENDING || s.status === SessionStatus.SUSPECTED
      ).length;

      return {
        success: true,
        data: {
          isOnAISite: isAI,
          currentSession: session ? {
            id: session.id,
            toolId: session.toolId,
            toolName: session.toolName,
            sourcePlatform: session.sourcePlatform,
            sourceKind: session.sourceKind,
            domain: session.rawDomain || session.domain,
            rawDomain: session.rawDomain,
            localDate: session.localDate,
            timezone: session.timezone,
            startTime: session.startedAt || session.startTime,
            duration: session.endedAt
              ? (session.activeSeconds || session.duration || 0)
              : Math.floor((Date.now() - new Date(session.startedAt || session.startTime).getTime()) / 1000),
            status: session.status,
          } : null,
          tabInfo: {
            domain: tabInfo.domain,
            url: tabInfo.url,
          },
          isPaused,
          pauseRemaining: getPauseRemaining(),
          stats: {
            todayDuration: totalDuration,
            todaySessionCount: todaySessions.length,
            todayEntryCount: todayEntries.length,
            pendingCount,
          },
          activeSessionsCount: activeSessions.length,
        },
      };
    }

    // ========================================================================
    // Session actions
    // ========================================================================
    case 'quickComplete': {
      const activeKey = currentActiveKey;
      const session = activeKey ? await quickEndSession(activeKey) : null;
      if (!session) {
        return { success: false, error: 'No active session (may have already ended)' };
      }
      return {
        success: true,
        data: session,
      };
    }

    case 'pauseOneHour': {
      await pauseDetection(60 * 60 * 1000); // 1 hour
      return {
        success: true,
        data: { pausedUntil: Date.now() + 60 * 60 * 1000 },
      };
    }

    case 'resumeDetection': {
      resumeDetection();
      return { success: true };
    }

    case 'ignoreDomain': {
      const domain = payload?.domain || getCurrentTabInfo().domain;
      if (!domain) {
        return { success: false, error: 'No domain to ignore' };
      }
      await addIgnoredDomain(domain);

      // End any active session for this domain (iterate all active sessions)
      for (const [key, state] of activeSessions) {
        if (state.session.rawDomain === domain) {
          await endSession(key);
        }
      }

      return { success: true, data: { ignored: domain } };
    }

    // ========================================================================
    // Data queries
    // ========================================================================
    case 'getSessions': {
      const sessions = payload?.date
        ? await getSessionsByDate(payload.date)
        : await getSessions();
      return { success: true, data: sessions };
    }

    case 'getEntries': {
      const entries = payload?.date
        ? await getEntriesByDate(payload.date)
        : await getEntries();
      return { success: true, data: entries };
    }

    case 'getTodayStats': {
      const today = new Date().toLocaleDateString('en-CA');
      const sessions = await getSessionsByDate(today);
      const entries = await getEntriesByDate(today);
      const summary = await getTodaySummary();

      const totalDuration = sessions.reduce((sum, s) => sum + (s.activeSeconds || s.duration || 0), 0);
      const completedSessions = sessions.filter(
        (s) => s.status === SessionStatus.COMPLETED || s.status === SessionStatus.MERGED
      );
      const pendingSessions = sessions.filter(
        (s) => s.status === SessionStatus.PENDING || s.status === SessionStatus.SUSPECTED
      );

      // Tool distribution
      const toolDist = {};
      for (const s of sessions) {
        toolDist[s.toolName] = (toolDist[s.toolName] || 0) + (s.activeSeconds || s.duration || 0);
      }

      return {
        success: true,
        data: {
          totalDuration,
          sessionCount: sessions.length,
          completedCount: completedSessions.length,
          pendingCount: pendingSessions.length,
          entryCount: entries.length,
          toolDistribution: toolDist,
          summary: summary || null,
        },
      };
    }

    // ========================================================================
    // Settings
    // ========================================================================
    case 'getSettings': {
      const settings = await getSettings();
      return { success: true, data: settings };
    }

    case 'saveSettings': {
      await saveSettings(payload);
      await reloadSettings();
      return { success: true };
    }

    // ========================================================================
    // Tool catalog
    // ========================================================================
    case 'getToolCatalog': {
      const settings = await getSettings();
      const tools = TOOL_CATALOG.map((tool) => ({
        ...tool,
        enabled: settings.toolState?.[tool.id]?.enabled ?? tool.default_enabled,
      }));
      return { success: true, data: tools };
    }

    case 'toggleTool': {
      const { toolId, enabled } = payload;
      const settings = await getSettings();
      if (!settings.toolState) settings.toolState = {};
      settings.toolState[toolId] = { enabled };
      await saveSettings(settings);
      await reloadSettings();
      return { success: true };
    }

    // ========================================================================
    // Custom domains
    // ========================================================================
    case 'addCustomDomain': {
      const { domain } = payload;
      if (!domain) return { success: false, error: 'Domain required' };
      const settings = await getSettings();
      if (!settings.customDomains.includes(domain)) {
        settings.customDomains.push(domain);
        await saveSettings(settings);
      }
      return { success: true };
    }

    case 'removeCustomDomain': {
      const { domain } = payload;
      const settings = await getSettings();
      settings.customDomains = settings.customDomains.filter((d) => d !== domain);
      await saveSettings(settings);
      return { success: true };
    }

    // ========================================================================
    // Ignored domains
    // ========================================================================
    case 'getIgnoredDomains': {
      const ignored = await getIgnoredDomains();
      return { success: true, data: ignored };
    }

    case 'removeIgnoredDomain': {
      const { domain } = payload;
      await removeIgnoredDomain(domain);
      return { success: true };
    }

    // ========================================================================
    // Export & Data management
    // ========================================================================
    case 'exportData': {
      const data = await exportAllData();
      return { success: true, data };
    }

    case 'getNativeStatus': {
      return {
        success: true,
        data: {
          connected: typeof nativeMessaging !== 'undefined' && nativeMessaging.isConnected(),
        },
      };
    }

    case 'connectNative': {
      const settings = await getSettings();
      if (!settings.nativeMessagingEnabled) {
        return { success: false, error: 'Native messaging is not enabled in settings' };
      }
      if (typeof nativeMessaging !== 'undefined') {
        nativeMessaging.connect();
        return { success: true, data: { connected: nativeMessaging.isConnected() } };
      }
      return { success: false, error: 'Native messaging not available' };
    }

    case 'clearAllData': {
      await endAllSessions();
      await clearAllData();
      return { success: true };
    }

    // ========================================================================
    // Ledger Entry save
    // ========================================================================
    case 'completeAndSaveEntry': {
      // Save entry first. If entry fails, session is untouched → user can retry.
      // Only after entry is persisted do we finalize and remove the active session.
      if (!payload || !payload.entry) {
        return { success: false, error: 'No entry data provided' };
      }
      const activeSession = getCurrentSession();
      if (!activeSession) {
        return { success: false, error: 'No active session' };
      }
      const activeKey = currentActiveKey;
      try {
        // Step 1: Save entry first (session is still active; failure → retry-safe)
        const entry = {
          ...payload.entry,
          detectedSessionId: payload.entry.detectedSessionId || activeSession.id,
        };
        await saveEntry(entry);

        // Step 2: Entry persisted — now finalize session as COMPLETED using key-based end
        let completedSession;
        if (activeKey) {
          completedSession = await quickEndSession(activeKey);
        } else {
          // Fallback: use domain-based lookup
          const domain = payload.domain || getCurrentTabInfo().domain;
          if (domain) completedSession = await quickEndSession(domain);
        }

        if (completedSession) {
          completedSession.status = SessionStatus.COMPLETED;
          await updateSession(completedSession.id, { status: SessionStatus.COMPLETED, updatedAt: new Date().toISOString() });

          // Add to sync queue if native messaging enabled
          const settings = await getSettings();
          if (settings.nativeMessagingEnabled) {
            await addToSyncQueue(completedSession.id);
            await updateSessionSyncStatus(completedSession.id, SyncStatus.PENDING);
          }
        }

        return { success: true, data: { session: completedSession, entry } };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case 'saveEntry': {
      if (!payload || !payload.entry) {
        return { success: false, error: 'No entry data provided' };
      }
      try {
        await saveEntry(payload.entry);
        const sessionId = payload.entry.detectedSessionId || payload.entry.sessionId;
        if (sessionId) {
          const updated = await updateSession(sessionId, { status: SessionStatus.COMPLETED, updatedAt: new Date().toISOString() });
          if (!updated) {
            return { success: false, error: 'Entry saved but linked session could not be marked completed' };
          }
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // ========================================================================
    // Prompt count (from content script)
    // ========================================================================
    case 'reportPrompt': {
      const { sessionId, domain } = payload || {};

      // Use the current active session's ID if not provided
      const activeSession = getCurrentSession();
      const targetId = sessionId || (activeSession?.id);

      if (targetId) {
        const count = await incrementPromptCount(targetId);
        if (activeSession && activeSession.id === targetId) {
          activeSession.promptCount = count;
        }
        // Also update in activeSessions map if present
        if (currentActiveKey) {
          const state = activeSessions.get(currentActiveKey);
          if (state && state.session.id === targetId) {
            state.session.promptCount = count;
          }
        }
        return { success: true, data: { count } };
      }

      // Fallback: look up by domain
      if (domain) {
        const session = getSessionForDomain(domain);
        if (session) {
          const count = await incrementPromptCount(session.id);
          session.promptCount = count;
          return { success: true, data: { count, sessionId: session.id } };
        }
        return { success: true, data: { count: 0, note: 'No active session for domain' } };
      }

      return { success: false, error: 'No sessionId or domain provided' };
    }

    default:
      return { success: false, error: `Unknown action: ${action}` };
  }
}

// ============================================================================
// Cleanup on Suspend
// ============================================================================

/**
 * When the service worker is about to be terminated,
 * flush all state to storage.
 * Note: This may not always fire; periodic alarms provide fallback.
 */
// self.addEventListener('beforeunload', () => {
//   // Not available in service workers
// });

// Instead, periodically flush via keepalive alarm (set up above).

// ============================================================================
// Native Messaging Integration (P1 — sync sessions to macOS app)
// ============================================================================

/**
 * Attempt to connect to the macOS native messaging host.
 * Silently fails if the host is not available.
 */
async function tryConnectNativeMessaging() {
  try {
    const settings = await getSettings();
    if (!settings.nativeMessagingEnabled) return;

    if (typeof nativeMessaging !== 'undefined') {
      nativeMessaging.connect();

      nativeMessaging.onConnectionChange((connected) => {
        console.debug('[Murmur SW] Native messaging connection:', connected);
        getSettings().then((s) => {
          s.extensionConnected = connected;
          saveSettings(s);
        });
      });
    }
  } catch (err) {
    console.debug('[Murmur SW] Native messaging not available:', err.message);
  }
}

/**
 * Sync a completed session to the macOS app via native messaging.
 * Called after a session is finalized.
 * @param {DetectedSession} session
 */
async function syncSessionToMacOS(session) {
  if (typeof nativeMessaging === 'undefined' || !nativeMessaging.isConnected()) {
    return;
  }
  try {
    const result = await nativeMessaging.sendSession(session);
    if (result.ok) {
      await removeFromSyncQueue(session.id);
      await updateSessionSyncStatus(session.id, SyncStatus.SYNCED, new Date().toISOString());
    } else {
      await updateSyncQueueItem(session.id, { lastError: result.error, attempts: 1 });
    }
  } catch (err) {
    console.debug('[Murmur SW] Native sync error:', err.message);
    await updateSyncQueueItem(session.id, { lastError: err.message });
  }
}

/**
 * Retry all pending items in the sync queue.
 */
async function retryPendingSyncs() {
  const settings = await getSettings();
  if (!settings.nativeMessagingEnabled) return;

  if (typeof nativeMessaging === 'undefined') return;
  if (!nativeMessaging.isConnected()) {
    nativeMessaging.connect();
    return;
  }

  const queue = await getSyncQueue();
  if (queue.length === 0) return;

  const sessions = await getSessions();
  const now = Date.now();

  for (const item of queue) {
    if (item.nextRetryAt > now) continue;

    const session = sessions.find(s => s.id === item.sessionId);
    if (!session) {
      await removeFromSyncQueue(item.sessionId);
      continue;
    }

    try {
      const result = await nativeMessaging.sendSession(session);
      if (result.ok) {
        await removeFromSyncQueue(session.id);
        await updateSessionSyncStatus(session.id, SyncStatus.SYNCED, new Date().toISOString());
      } else {
        const newAttempts = (item.attempts || 0) + 1;
        await updateSyncQueueItem(session.id, {
          attempts: newAttempts,
          lastError: result.error,
          nextRetryAt: now + Math.min(60000 * Math.pow(2, newAttempts), 600000), // exp backoff, max 10min
        });
        await updateSessionSyncStatus(session.id, SyncStatus.FAILED);
      }
    } catch (err) {
      const newAttempts = (item.attempts || 0) + 1;
      await updateSyncQueueItem(session.id, {
        attempts: newAttempts,
        lastError: err.message,
        nextRetryAt: now + Math.min(60000 * Math.pow(2, newAttempts), 600000),
      });
    }
  }
}

/**
 * Sync a batch of pending sessions to the macOS app.
 */
async function syncPendingToMacOS() {
  await retryPendingSyncs();
}

// Add native messaging status to getStatus response
// The 'getStatus' and 'getNativeStatus' actions are handled in the message router

console.log('[Murmur SW] Service worker loaded');
