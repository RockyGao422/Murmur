/**
 * @fileoverview chrome.storage.local wrapper for Murmur Browser Extension.
 * Provides promise-based APIs for all data storage operations.
 */

const STORAGE_KEYS = Object.freeze({
  SESSIONS: 'murmur_sessions',
  ENTRIES: 'murmur_entries',
  DAILY_SUMMARIES: 'murmur_daily_summaries',
  SETTINGS: 'murmur_settings',
  IGNORED_DOMAINS: 'murmur_ignored_domains',
  ACTIVE_SESSION: 'murmur_active_session',
  ACTIVE_SESSIONS_MAP: 'murmur_active_sessions_by_key',
  PROMPT_COUNTS: 'murmur_prompt_counts',
  SYNC_QUEUE: 'murmur_sync_queue',
  DEVICE_ID: 'murmur_device_id',
});

/**
 * Default settings applied on first run.
 * @type {import('./types.js').MurmurSettings}
 */
const DEFAULT_SETTINGS = Object.freeze({
  toolState: {},
  customDomains: [],
  promptCountingEnabled: false, // P1 — off by default
  nativeMessagingEnabled: false, // P1 — off by default
  minSessionSeconds: 15,
  suspectedThresholdSeconds: 30,
  mergeWindowMinutes: 3,
  debugMode: false,
});

// ============================================================================
// Sessions
// ============================================================================

/**
 * Get all detected sessions.
 * @returns {Promise<import('./types.js').DetectedSession[]>}
 */
async function getSessions() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
    return result[STORAGE_KEYS.SESSIONS] || [];
  } catch (err) {
    console.error('[Murmur Storage] Failed to get sessions:', err);
    return [];
  }
}

/**
 * Save a new session.
 * @param {import('./types.js').DetectedSession} session
 * @returns {Promise<void>}
 */
async function saveSession(session) {
  const sessions = await getSessions();
  sessions.push(session);
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
}

/**
 * Update an existing session by ID.
 * @param {string} id
 * @param {Partial<import('./types.js').DetectedSession>} updates
 * @returns {Promise<import('./types.js').DetectedSession|null>}
 */
async function updateSession(id, updates) {
  try {
    const sessions = await getSessions();
    const index = sessions.findIndex((s) => s.id === id);
    if (index === -1) return null;

    sessions[index] = {
      ...sessions[index],
      ...updates,
      updatedAt: updates.updatedAt || new Date().toISOString(),
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
    return sessions[index];
  } catch (err) {
    console.error('[Murmur Storage] Failed to update session:', err);
    return null;
  }
}

/**
 * Get sessions for a specific date (YYYY-MM-DD).
 * @param {string} dateStr
 * @returns {Promise<import('./types.js').DetectedSession[]>}
 */
async function getSessionsByDate(dateStr) {
  const sessions = await getSessions();
  return sessions.filter((s) => {
    // Prefer explicit localDate (set at session creation time in local timezone)
    if (s.localDate) return s.localDate === dateStr;
    // Fallback: parse startedAt / startTime in local time
    const d = s.startedAt || s.startTime;
    if (!d) return false;
    const datePart = new Date(d).toLocaleDateString('en-CA');
    return datePart === dateStr;
  });
}

/**
 * Get all active (non-ended) sessions.
 * @returns {Promise<import('./types.js').DetectedSession[]>}
 */
async function getActiveSessions() {
  const sessions = await getSessions();
  return sessions.filter((s) => {
    const hasEnded = s.endedAt || s.endTime;
    return !hasEnded;
  });
}

// ============================================================================
// Ledger Entries
// ============================================================================

/**
 * Get all ledger entries.
 * @returns {Promise<import('./types.js').LedgerEntry[]>}
 */
async function getEntries() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ENTRIES);
    return result[STORAGE_KEYS.ENTRIES] || [];
  } catch (err) {
    console.error('[Murmur Storage] Failed to get entries:', err);
    return [];
  }
}

/**
 * Save a new ledger entry.
 * @param {import('./types.js').LedgerEntry} entry
 * @returns {Promise<void>}
 */
async function saveEntry(entry) {
  try {
    const entries = await getEntries();
    // Dedup by detectedSessionId (new model) with fallback to sessionId (legacy)
    const existingIdx = entries.findIndex((e) =>
      (entry.detectedSessionId && e.detectedSessionId === entry.detectedSessionId) ||
      (entry.detectedSessionId && e.sessionId === entry.detectedSessionId) ||
      (entry.sessionId && e.sessionId === entry.sessionId) ||
      (entry.sessionId && e.detectedSessionId === entry.sessionId)
    );
    if (existingIdx !== -1) {
      entries[existingIdx] = entry;
    } else {
      entries.push(entry);
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.ENTRIES]: entries });
  } catch (err) {
    console.error('[Murmur Storage] Failed to save entry:', err);
    throw err;
  }
}

/**
 * Get entries for a specific date.
 * @param {string} dateStr
 * @returns {Promise<import('./types.js').LedgerEntry[]>}
 */
async function getEntriesByDate(dateStr) {
  const entries = await getEntries();
  return entries.filter((e) => {
    // Prefer explicit localDate (set at entry creation time in local timezone)
    if (e.localDate) return e.localDate === dateStr;
    // Fallback: parse createdAt in local time (handles both ISO string and epoch number)
    const d = e.createdAt;
    if (!d) return false;
    return new Date(d).toLocaleDateString('en-CA') === dateStr;
  });
}

// ============================================================================
// Daily Summaries
// ============================================================================

/**
 * Get all daily summaries.
 * @returns {Promise<import('./types.js').DailySummary[]>}
 */
async function getDailySummaries() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_SUMMARIES);
    return result[STORAGE_KEYS.DAILY_SUMMARIES] || [];
  } catch (err) {
    console.error('[Murmur Storage] Failed to get daily summaries:', err);
    return [];
  }
}

/**
 * Save or update a daily summary (keyed by date string YYYY-MM-DD).
 * @param {import('./types.js').DailySummary} summary
 * @returns {Promise<void>}
 */
async function saveDailySummary(summary) {
  try {
    const summaries = await getDailySummaries();
    const existingIdx = summaries.findIndex((s) => s.id === summary.id);
    summary.updatedAt = Date.now();
    if (existingIdx !== -1) {
      summaries[existingIdx] = summary;
    } else {
      summary.createdAt = Date.now();
      summaries.push(summary);
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_SUMMARIES]: summaries });
  } catch (err) {
    console.error('[Murmur Storage] Failed to save daily summary:', err);
  }
}

/**
 * Get the daily summary for today.
 * @returns {Promise<import('./types.js').DailySummary|null>}
 */
async function getTodaySummary() {
  const today = new Date().toLocaleDateString('en-CA');
  const summaries = await getDailySummaries();
  return summaries.find((s) => s.id === today) || null;
}

// ============================================================================
// Settings
// ============================================================================

/**
 * Get current settings, merged with defaults.
 * @returns {Promise<import('./types.js').MurmurSettings>}
 */
async function getSettings() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const stored = result[STORAGE_KEYS.SETTINGS] || {};
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch (err) {
    console.error('[Murmur Storage] Failed to get settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings (partial merge).
 * @param {Partial<import('./types.js').MurmurSettings>} settings
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  try {
    const current = await getSettings();
    const merged = { ...current, ...settings };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  } catch (err) {
    console.error('[Murmur Storage] Failed to save settings:', err);
  }
}

// ============================================================================
// Ignored Domains
// ============================================================================

/**
 * Get ignored domains list.
 * @returns {Promise<import('./types.js').IgnoredTarget[]>}
 */
async function getIgnoredDomains() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.IGNORED_DOMAINS);
    return result[STORAGE_KEYS.IGNORED_DOMAINS] || [];
  } catch (err) {
    console.error('[Murmur Storage] Failed to get ignored domains:', err);
    return [];
  }
}

/**
 * Add a domain to the ignored list.
 * @param {string} domain
 * @returns {Promise<void>}
 */
async function addIgnoredDomain(domain) {
  try {
    const ignored = await getIgnoredDomains();
    // Avoid duplicates
    if (!ignored.some((i) => i.domain === domain)) {
      ignored.push({ domain, addedAt: Date.now() });
      await chrome.storage.local.set({ [STORAGE_KEYS.IGNORED_DOMAINS]: ignored });
    }
  } catch (err) {
    console.error('[Murmur Storage] Failed to add ignored domain:', err);
  }
}

/**
 * Remove a domain from the ignored list.
 * @param {string} domain
 * @returns {Promise<void>}
 */
async function removeIgnoredDomain(domain) {
  try {
    const ignored = await getIgnoredDomains();
    const filtered = ignored.filter((i) => i.domain !== domain);
    await chrome.storage.local.set({ [STORAGE_KEYS.IGNORED_DOMAINS]: filtered });
  } catch (err) {
    console.error('[Murmur Storage] Failed to remove ignored domain:', err);
  }
}

// ============================================================================
// Active Session (in-memory backup to storage)
// ============================================================================

/**
 * Persist active session state for service worker restart recovery.
 * @param {import('./types.js').DetectedSession|null} session
 * @returns {Promise<void>}
 */
async function saveActiveSession(session) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSION]: session });
  } catch (err) {
    console.error('[Murmur Storage] Failed to save active session:', err);
  }
}

/**
 * Recover active session after service worker restart.
 * @returns {Promise<import('./types.js').DetectedSession|null>}
 */
async function getActiveSession() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSION);
    return result[STORAGE_KEYS.ACTIVE_SESSION] || null;
  } catch (err) {
    console.error('[Murmur Storage] Failed to get active session:', err);
    return null;
  }
}

// ============================================================================
// Prompt Counts
// ============================================================================

/**
 * Get prompt count for a session.
 * @param {string} sessionId
 * @returns {Promise<number>}
 */
async function getPromptCount(sessionId) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PROMPT_COUNTS);
    const counts = result[STORAGE_KEYS.PROMPT_COUNTS] || {};
    return counts[sessionId] || 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Increment prompt count for a session.
 * @param {string} sessionId
 * @returns {Promise<number>}
 */
async function incrementPromptCount(sessionId) {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PROMPT_COUNTS);
    const counts = result[STORAGE_KEYS.PROMPT_COUNTS] || {};
    counts[sessionId] = (counts[sessionId] || 0) + 1;
    await chrome.storage.local.set({ [STORAGE_KEYS.PROMPT_COUNTS]: counts });
    return counts[sessionId];
  } catch (err) {
    return 0;
  }
}

/**
 * Persist all active sessions as a map keyed by "windowId:tabId".
 * Used for multi-tab recovery after service worker restart.
 * @param {Object<string, Object>} sessionsByKey
 * @returns {Promise<void>}
 */
async function saveActiveSessionsMap(sessionsByKey) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS_MAP]: sessionsByKey });
  } catch (err) {
    console.error('[Murmur Storage] Failed to save active sessions map:', err);
  }
}

/**
 * Recover active sessions map after service worker restart.
 * @returns {Promise<Object<string, Object>>}
 */
async function getActiveSessionsMap() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSIONS_MAP);
    return result[STORAGE_KEYS.ACTIVE_SESSIONS_MAP] || {};
  } catch (err) {
    return {};
  }
}

// ============================================================================
// Sync Queue (Native Messaging)
// ============================================================================

/**
 * Get the sync queue.
 * @returns {Promise<import('./types.js').SyncQueueItem[]>}
 */
async function getSyncQueue() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SYNC_QUEUE);
    return result[STORAGE_KEYS.SYNC_QUEUE] || [];
  } catch (err) {
    return [];
  }
}

/**
 * Add a session ID to the sync queue.
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
async function addToSyncQueue(sessionId) {
  try {
    const queue = await getSyncQueue();
    if (!queue.some(item => item.sessionId === sessionId)) {
      queue.push({
        sessionId,
        attempts: 0,
        lastError: null,
        nextRetryAt: Date.now(),
        createdAt: new Date().toISOString(),
      });
      await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_QUEUE]: queue });
    }
  } catch (err) {
    console.error('[Murmur Storage] Failed to add to sync queue:', err);
  }
}

/**
 * Update a sync queue item.
 * @param {string} sessionId
 * @param {Partial<import('./types.js').SyncQueueItem>} updates
 * @returns {Promise<void>}
 */
async function updateSyncQueueItem(sessionId, updates) {
  try {
    const queue = await getSyncQueue();
    const idx = queue.findIndex(item => item.sessionId === sessionId);
    if (idx !== -1) {
      queue[idx] = { ...queue[idx], ...updates };
      await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_QUEUE]: queue });
    }
  } catch (err) {
    console.error('[Murmur Storage] Failed to update sync queue item:', err);
  }
}

/**
 * Remove a session ID from the sync queue (sync completed).
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
async function removeFromSyncQueue(sessionId) {
  try {
    const queue = await getSyncQueue();
    const filtered = queue.filter(item => item.sessionId !== sessionId);
    await chrome.storage.local.set({ [STORAGE_KEYS.SYNC_QUEUE]: filtered });
  } catch (err) {
    console.error('[Murmur Storage] Failed to remove from sync queue:', err);
  }
}

/**
 * Update sync status fields on a stored session.
 * @param {string} sessionId
 * @param {string} syncStatus - 'pending' | 'synced' | 'failed'
 * @param {string} [syncedAt] - ISO timestamp
 * @returns {Promise<void>}
 */
async function updateSessionSyncStatus(sessionId, syncStatus, syncedAt) {
  try {
    const sessions = await getSessions();
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx !== -1) {
      sessions[idx].syncStatus = syncStatus;
      sessions[idx].syncedAt = syncedAt || null;
      sessions[idx].updatedAt = new Date().toISOString();
      await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
    }
  } catch (err) {
    console.error('[Murmur Storage] Failed to update sync status:', err);
  }
}

// ============================================================================
// Data Management
// ============================================================================

/**
 * Clear all Murmur data from storage.
 * @returns {Promise<void>}
 */
async function clearAllData() {
  try {
    const keys = Object.values(STORAGE_KEYS);
    await chrome.storage.local.remove(keys);
    console.log('[Murmur Storage] All data cleared');
  } catch (err) {
    console.error('[Murmur Storage] Failed to clear data:', err);
    throw err;
  }
}

/**
 * Get the total byte size of all Murmur data in storage.
 * @returns {Promise<number>}
 */
async function getStorageUsage() {
  try {
    const all = await chrome.storage.local.get(null);
    const murmurData = {};
    for (const key of Object.values(STORAGE_KEYS)) {
      if (all[key] !== undefined) {
        murmurData[key] = all[key];
      }
    }
    return new Blob([JSON.stringify(murmurData)]).size;
  } catch (err) {
    console.error('[Murmur Storage] Failed to get storage usage:', err);
    return 0;
  }
}

/**
 * Get all data for export.
 * @returns {Promise<{sessions: Array, entries: Array, summaries: Array,
 *           settings: Object, ignoredDomains: Array}>}
 */
async function exportAllData() {
  const [sessions, entries, summaries, settings, ignoredDomains] = await Promise.all([
    getSessions(),
    getEntries(),
    getDailySummaries(),
    getSettings(),
    getIgnoredDomains(),
  ]);
  return { sessions, entries, summaries, settings, ignoredDomains };
}

// Export to global scope for service worker (loaded via importScripts)
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    // Sessions
    getSessions,
    saveSession,
    updateSession,
    getSessionsByDate,
    getActiveSessions,
    // Entries
    getEntries,
    saveEntry,
    getEntriesByDate,
    // Summaries
    getDailySummaries,
    saveDailySummary,
    getTodaySummary,
    // Settings
    getSettings,
    saveSettings,
    // Ignored
    getIgnoredDomains,
    addIgnoredDomain,
    removeIgnoredDomain,
    // Active session
    saveActiveSession,
    getActiveSession,
    // Active sessions map (multi-tab recovery)
    saveActiveSessionsMap,
    getActiveSessionsMap,
    // Prompt counts
    getPromptCount,
    incrementPromptCount,
    // Sync queue
    getSyncQueue,
    addToSyncQueue,
    updateSyncQueueItem,
    removeFromSyncQueue,
    updateSessionSyncStatus,
    // Management
    clearAllData,
    getStorageUsage,
    exportAllData,
  });
}
