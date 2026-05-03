/**
 * @fileoverview Browser event detector for Murmur Browser Extension.
 * Listens to tab, window, navigation, and idle events to detect AI website usage.
 * Converts browser events into RawEvents and feeds them to the sessionizer.
 */

// ============================================================================
// State
// ============================================================================

/**
 * Currently active tab info.
 * @type {{tabId: number|null, windowId: number|null, url: string|null,
 *         domain: string|null, title: string|null, isIncognito: boolean}}
 */
let currentTab = {
  tabId: null,
  windowId: null,
  url: null,
  domain: null,
  title: null,
  isIncognito: false,
};

/**
 * Whether the browser window is currently focused.
 * @type {boolean}
 */
let windowFocused = true;

/**
 * Whether the user is currently idle.
 * @type {boolean}
 */
let isUserIdle = false;

/**
 * Whether detection is active.
 * @type {boolean}
 */
let detectionActive = false;

/**
 * Pause detection until this timestamp (epoch ms).
 * Used for "pause 1 hour" feature.
 * @type {number}
 */
let pauseUntil = 0;

/**
 * Listener references for cleanup.
 * @type {Array<{remove: Function}>}
 */
let listeners = [];

// ============================================================================
// RawEvent Factory
// ============================================================================

/**
 * Create a RawEvent from browser event data.
 * @param {string} eventType
 * @param {number} tabId
 * @param {number} windowId
 * @param {string|null} url
 * @param {string|null} domain
 * @param {string|null} title
 * @param {boolean} isIncognito
 * @param {Object|null} metadata
 * @returns {import('../shared/types.js').RawEvent}
 */
function createRawEvent(eventType, tabId, windowId, url, domain, title, isIncognito, metadata = null) {
  return {
    id: generateUUID(),
    eventType,
    timestamp: Date.now(),
    tabId,
    windowId,
    url,
    domain: domain || (url ? getDomainFromUrl(url) : null),
    title,
    isIncognito,
    metadata,
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle tab activation (user switches to a different tab).
 * @param {chrome.tabs.TabActiveInfo} activeInfo
 */
async function onTabActivated(activeInfo) {
  if (!detectionActive || Date.now() < pauseUntil) return;

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (chrome.runtime.lastError || !tab) return;

    // Skip incognito
    if (tab.incognito) {
      currentTab.isIncognito = true;
      return;
    }

    const url = tab.url || tab.pendingUrl || null;
    const domain = url ? getDomainFromUrl(url) : null;
    const title = tab.title || null;

    // Update current tab state
    currentTab = {
      tabId: tab.id,
      windowId: tab.windowId,
      url,
      domain,
      title,
      isIncognito: false,
    };

    const rawEvent = createRawEvent(
      EventType.TAB_ACTIVATED,
      tab.id,
      tab.windowId,
      url,
      domain,
      title,
      false
    );

    if (windowFocused && !isUserIdle) {
      await processEvent(rawEvent);
    }
  } catch (err) {
    console.error('[Murmur Detector] Tab activated error:', err);
  }
}

/**
 * Handle tab update (URL or title changed).
 * @param {number} tabId
 * @param {chrome.tabs.TabChangeInfo} changeInfo
 * @param {chrome.tabs.Tab} tab
 */
async function onTabUpdated(tabId, changeInfo, tab) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  if (tab.incognito) return;

  // Only process URL changes
  if (!changeInfo.url && !changeInfo.status) return;
  if (changeInfo.status && changeInfo.status !== 'complete') return;

  const url = tab.url || changeInfo.url || null;
  if (!url) return;

  const domain = getDomainFromUrl(url);
  const title = tab.title || null;

  // Update current tab if this is the active tab
  if (tab.active) {
    currentTab = {
      tabId: tab.id,
      windowId: tab.windowId,
      url,
      domain,
      title,
      isIncognito: false,
    };
  }

  const rawEvent = createRawEvent(
    EventType.TAB_UPDATED,
    tabId,
    tab.windowId,
    url,
    domain,
    title,
    false,
    { status: changeInfo.status }
  );

  if (windowFocused && !isUserIdle && tab.active) {
    await processEvent(rawEvent);
  }
}

/**
 * Handle tab removal (tab closed).
 * @param {number} tabId
 * @param {chrome.tabs.TabRemoveInfo} removeInfo
 */
async function onTabRemoved(tabId, removeInfo) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  if (removeInfo.isWindowClosing) return; // Handled separately

  // Get the URL of the closed tab from our tracking
  const domain = currentTab.tabId === tabId ? currentTab.domain : null;
  if (!domain) return;

  const rawEvent = createRawEvent(
    EventType.TAB_REMOVED,
    tabId,
    removeInfo.windowId,
    currentTab.url,
    domain,
    currentTab.title,
    false
  );

  await processEvent(rawEvent);

  // If this was the current tab, clear tracking
  if (currentTab.tabId === tabId) {
    currentTab = { tabId: null, windowId: null, url: null, domain: null, title: null, isIncognito: false };
  }
}

/**
 * Handle window focus changes.
 * @param {number} windowId
 */
async function onWindowFocusChanged(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // All windows lost focus
    windowFocused = false;
    const rawEvent = createRawEvent(
      EventType.WINDOW_FOCUS_CHANGED,
      currentTab.tabId,
      currentTab.windowId,
      currentTab.url,
      currentTab.domain,
      currentTab.title,
      false,
      { focused: false }
    );
    await processEvent(rawEvent);
  } else {
    windowFocused = true;
    // Get the active tab in the newly focused window
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs.length > 0 && !tabs[0].incognito) {
        currentTab = {
          tabId: tabs[0].id,
          windowId: tabs[0].windowId,
          url: tabs[0].url,
          domain: tabs[0].url ? getDomainFromUrl(tabs[0].url) : null,
          title: tabs[0].title,
          isIncognito: false,
        };
      }
    } catch (err) {
      // ignore
    }
    const rawEvent = createRawEvent(
      EventType.WINDOW_FOCUS_CHANGED,
      currentTab.tabId,
      currentTab.windowId,
      currentTab.url,
      currentTab.domain,
      currentTab.title,
      false,
      { focused: true }
    );
    await processEvent(rawEvent);
  }
}

/**
 * Handle web navigation committed events.
 * More precise than tab updates — fires when navigation actually starts.
 * @param {chrome.webNavigation.WebNavigationFramedCallbackDetails} details
 */
async function onNavigationCommitted(details) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  if (details.frameId !== 0) return; // Only main frame

  const url = details.url;
  const domain = getDomainFromUrl(url);

  // Update current tab if this is the active tab
  if (currentTab.tabId === details.tabId) {
    currentTab.url = url;
    currentTab.domain = domain;
  }

  const rawEvent = createRawEvent(
    EventType.NAVIGATION_COMMITTED,
    details.tabId,
    0, // windowId not available in navigation events
    url,
    domain,
    null,
    false,
    { transitionType: details.transitionType }
  );

  if (windowFocused && !isUserIdle) {
    await processEvent(rawEvent);
  }
}

/**
 * Handle idle state changes.
 * @param {chrome.idle.IdleState} newState
 */
async function onIdleStateChanged(newState) {
  if (!detectionActive) return;

  const settings = await getSettings();
  if (!settings.idleDetectionEnabled) return;

  const stateMap = {
    'active': 'active',
    'idle': 'idle',
    'locked': 'idle',
  };
  const mappedState = stateMap[newState] || newState;

  if (mappedState === 'idle' && !isUserIdle) {
    isUserIdle = true;
    const rawEvent = createRawEvent(
      EventType.IDLE_STATE_CHANGED,
      currentTab.tabId,
      currentTab.windowId,
      currentTab.url,
      currentTab.domain,
      currentTab.title,
      false,
      { state: mappedState }
    );
    await processEvent(rawEvent);
  } else if (mappedState === 'active' && isUserIdle) {
    isUserIdle = false;
    const rawEvent = createRawEvent(
      EventType.IDLE_STATE_CHANGED,
      currentTab.tabId,
      currentTab.windowId,
      currentTab.url,
      currentTab.domain,
      currentTab.title,
      false,
      { state: mappedState }
    );
    await processEvent(rawEvent);
  }
}

// ============================================================================
// Detection Control
// ============================================================================

/**
 * Start detection by attaching all event listeners.
 * @returns {Promise<void>}
 */
async function startDetection() {
  if (detectionActive) return;

  // Load settings for pause state
  const storedSettings = await getSettings();
  const pauseData = await chrome.storage.local.get('murmur_pause_until');
  pauseUntil = pauseData['murmur_pause_until'] || 0;

  // Get current active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && !tabs[0].incognito) {
      currentTab = {
        tabId: tabs[0].id,
        windowId: tabs[0].windowId,
        url: tabs[0].url,
        domain: tabs[0].url ? getDomainFromUrl(tabs[0].url) : null,
        title: tabs[0].title,
        isIncognito: false,
      };

      // Check if current tab is on an AI site and start tracking
      if (currentTab.url && currentTab.domain) {
        const match = await matchEvent(
          createRawEvent(
            EventType.TAB_ACTIVATED,
            currentTab.tabId,
            currentTab.windowId,
            currentTab.url,
            currentTab.domain,
            currentTab.title,
            false
          ),
          storedSettings.toolState
        );
        if (match.tool && !match.shouldIgnore) {
          await processEvent(
            createRawEvent(
              EventType.TAB_ACTIVATED,
              currentTab.tabId,
              currentTab.windowId,
              currentTab.url,
              currentTab.domain,
              currentTab.title,
              false
            )
          );
        }
      }
    }
  } catch (err) {
    console.error('[Murmur Detector] Initial tab query error:', err);
  }

  // Attach listeners
  chrome.tabs.onActivated.addListener(onTabActivated);
  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);
  chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);
  chrome.webNavigation.onCommitted.addListener(onNavigationCommitted);

  // Idle detection
  if (chrome.idle && chrome.idle.onStateChanged) {
    chrome.idle.onStateChanged.addListener(onIdleStateChanged);
  }

  // Set idle detection threshold
  try {
    if (chrome.idle && chrome.idle.setDetectionInterval) {
      const thresholdSeconds = (storedSettings.idleThresholdMinutes || 3) * 60;
      await chrome.idle.setDetectionInterval(thresholdSeconds);
    }
  } catch (err) {
    // Some browsers may not support this
  }

  detectionActive = true;
  console.log('[Murmur Detector] Detection started');
}

/**
 * Stop detection and remove all listeners.
 */
function stopDetection() {
  if (!detectionActive) return;

  chrome.tabs.onActivated.removeListener(onTabActivated);
  chrome.tabs.onUpdated.removeListener(onTabUpdated);
  chrome.tabs.onRemoved.removeListener(onTabRemoved);
  chrome.windows.onFocusChanged.removeListener(onWindowFocusChanged);
  chrome.webNavigation.onCommitted.removeListener(onNavigationCommitted);

  if (chrome.idle && chrome.idle.onStateChanged) {
    chrome.idle.onStateChanged.removeListener(onIdleStateChanged);
  }

  detectionActive = false;
  console.log('[Murmur Detector] Detection stopped');
}

/**
 * Pause detection for a specified duration.
 * @param {number} durationMs — pause duration in milliseconds
 */
async function pauseDetection(durationMs) {
  pauseUntil = Date.now() + durationMs;
  await chrome.storage.local.set({ 'murmur_pause_until': pauseUntil });

  // Pause all active sessions
  for (const session of getActiveSessions()) {
    pauseSession(session.domain);
  }

  console.log('[Murmur Detector] Paused until', new Date(pauseUntil).toISOString());
}

/**
 * Resume detection if paused.
 */
function resumeDetection() {
  pauseUntil = 0;
  chrome.storage.local.remove('murmur_pause_until');
  console.log('[Murmur Detector] Detection resumed');
}

// ============================================================================
// Query API
// ============================================================================

/**
 * Get the current active session (for popup display).
 * @returns {import('../shared/types.js').DetectedSession|null}
 */
function getCurrentSession() {
  if (!currentTab.domain) return null;
  return getSessionForDomain(currentTab.domain);
}

/**
 * Check if the current active tab is on an AI site.
 * @returns {boolean}
 */
function isOnAISite() {
  if (!currentTab.domain) return false;
  return isAIDomain(currentTab.domain);
}

/**
 * Get current tab info.
 * @returns {{tabId: number|null, windowId: number|null, url: string|null,
 *            domain: string|null, title: string|null, isIncognito: boolean}}
 */
function getCurrentTabInfo() {
  return { ...currentTab };
}

/**
 * Check if detection is paused.
 * @returns {boolean}
 */
function isDetectionPaused() {
  return Date.now() < pauseUntil;
}

/**
 * Get remaining pause time in seconds.
 * @returns {number}
 */
function getPauseRemaining() {
  if (!isDetectionPaused()) return 0;
  return Math.max(0, Math.floor((pauseUntil - Date.now()) / 1000));
}

// Export to global scope
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    // Detection control
    startDetection,
    stopDetection,
    pauseDetection,
    resumeDetection,
    // Query
    getCurrentSession,
    isOnAISite,
    getCurrentTabInfo,
    isDetectionPaused,
    getPauseRemaining,
    // State
    currentTab,
    windowFocused,
    isUserIdle,
    detectionActive,
  });
}
