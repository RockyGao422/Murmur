/**
 * @fileoverview Browser event detector for Murmur Browser Extension.
 * Privacy-first: only domain and URL patterns are captured, never full URLs or page titles.
 * Listens to tab, window, and navigation events to detect AI website usage.
 */

// ============================================================================
// State
// ============================================================================

let currentTab = {
  tabId: null,
  windowId: null,
  domain: null,
  urlPattern: null,
  isIncognito: false,
};

let windowFocused = true;
let detectionActive = false;
let pauseUntil = 0;

// ============================================================================
// URL Normalization
// ============================================================================

/**
 * Strip URL to domain and pattern only. Never stores full URL.
 * @param {string|null} rawUrl
 * @returns {{domain: string|null, urlPattern: string|null}}
 */
function normalizeUrl(rawUrl) {
  if (!rawUrl) return { domain: null, urlPattern: null };
  try {
    const u = new URL(rawUrl);
    const domain = u.hostname.replace(/^www\./, '');
    // urlPattern: hostname + first path segment only (for distinguishing sub-pages)
    const pathParts = u.pathname.split('/').filter(Boolean);
    const urlPattern = pathParts.length > 0
      ? `${domain}/${pathParts[0]}/*`
      : `${domain}/*`;
    return { domain, urlPattern };
  } catch (_) {
    return { domain: null, urlPattern: null };
  }
}

// ============================================================================
// RawEvent Factory (privacy-first: no full URL, no title)
// ============================================================================

/**
 * @param {string} eventType
 * @param {number} tabId
 * @param {number} windowId
 * @param {string|null} domain
 * @param {string|null} urlPattern
 * @param {boolean} isIncognito
 * @param {Object|null} metadata
 * @returns {Object}
 */
function createRawEvent(eventType, tabId, windowId, domain, urlPattern, isIncognito, metadata = null) {
  return {
    eventId: generateUUID(),
    platform: SourcePlatform.BROWSER,
    eventType,
    timestamp: new Date().toISOString(),
    appName: null,
    bundleId: null,
    packageName: null,
    domain,
    urlPattern,
    windowTitle: null,
    tabId,
    windowId,
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

async function onTabActivated(activeInfo) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (chrome.runtime.lastError || !tab || tab.incognito) {
      currentTab.isIncognito = true;
      return;
    }
    const url = tab.url || tab.pendingUrl || null;
    const { domain, urlPattern } = normalizeUrl(url);
    currentTab = { tabId: tab.id, windowId: tab.windowId, domain, urlPattern, isIncognito: false };

    if (windowFocused) {
      const rawEvent = createRawEvent(EventType.TAB_ACTIVATED, tab.id, tab.windowId, domain, urlPattern, false);
      await processEvent(rawEvent);
    }
  } catch (err) {
    console.error('[Murmur Detector] Tab activated error:', err);
  }
}

async function onTabUpdated(tabId, changeInfo, tab) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  if (tab.incognito) return;
  if (!changeInfo.url && changeInfo.status !== 'complete') return;

  const url = tab.url || changeInfo.url || null;
  if (!url) return;
  const { domain, urlPattern } = normalizeUrl(url);

  if (tab.active) {
    currentTab = { tabId: tab.id, windowId: tab.windowId, domain, urlPattern, isIncognito: false };
  }

  if (windowFocused && tab.active) {
    const rawEvent = createRawEvent(EventType.TAB_UPDATED, tabId, tab.windowId, domain, urlPattern, false, { status: changeInfo.status });
    await processEvent(rawEvent);
  }
}

async function onTabRemoved(tabId, removeInfo) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  if (removeInfo.isWindowClosing) return;

  const domain = currentTab.tabId === tabId ? currentTab.domain : null;
  if (!domain) return;

  const rawEvent = createRawEvent(EventType.TAB_REMOVED, tabId, removeInfo.windowId, domain, currentTab.urlPattern, false);
  await processEvent(rawEvent);

  if (currentTab.tabId === tabId) {
    currentTab = { tabId: null, windowId: null, domain: null, urlPattern: null, isIncognito: false };
  }
}

async function onWindowFocusChanged(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    windowFocused = false;
    const rawEvent = createRawEvent(EventType.WINDOW_FOCUS_CHANGED, currentTab.tabId, currentTab.windowId, currentTab.domain, currentTab.urlPattern, false, { focused: false });
    await processEvent(rawEvent);
  } else {
    windowFocused = true;
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs.length > 0 && !tabs[0].incognito) {
        const { domain, urlPattern } = normalizeUrl(tabs[0].url);
        currentTab = { tabId: tabs[0].id, windowId: tabs[0].windowId, domain, urlPattern, isIncognito: false };
      }
    } catch (_) { /* ignore */ }
    const rawEvent = createRawEvent(EventType.WINDOW_FOCUS_CHANGED, currentTab.tabId, currentTab.windowId, currentTab.domain, currentTab.urlPattern, false, { focused: true });
    await processEvent(rawEvent);
  }
}

async function onNavigationCommitted(details) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  if (details.frameId !== 0) return;

  const { domain, urlPattern } = normalizeUrl(details.url);
  if (currentTab.tabId === details.tabId) {
    currentTab.domain = domain;
    currentTab.urlPattern = urlPattern;
  }

  if (windowFocused) {
    const rawEvent = createRawEvent(EventType.NAVIGATION_COMMITTED, details.tabId, 0, domain, urlPattern, false, { transitionType: details.transitionType });
    await processEvent(rawEvent);
  }
}

// ============================================================================
// Detection Control
// ============================================================================

async function startDetection() {
  if (detectionActive) return;

  const pauseData = await chrome.storage.local.get('murmur_pause_until');
  pauseUntil = pauseData['murmur_pause_until'] || 0;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && !tabs[0].incognito) {
      const { domain, urlPattern } = normalizeUrl(tabs[0].url);
      currentTab = { tabId: tabs[0].id, windowId: tabs[0].windowId, domain, urlPattern, isIncognito: false };
    }
  } catch (err) {
    console.error('[Murmur Detector] Initial tab query error:', err);
  }

  chrome.tabs.onActivated.addListener(onTabActivated);
  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);
  chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);
  chrome.webNavigation.onCommitted.addListener(onNavigationCommitted);

  detectionActive = true;
  console.log('[Murmur Detector] Detection started');
}

function stopDetection() {
  if (!detectionActive) return;
  chrome.tabs.onActivated.removeListener(onTabActivated);
  chrome.tabs.onUpdated.removeListener(onTabUpdated);
  chrome.tabs.onRemoved.removeListener(onTabRemoved);
  chrome.windows.onFocusChanged.removeListener(onWindowFocusChanged);
  chrome.webNavigation.onCommitted.removeListener(onNavigationCommitted);
  detectionActive = false;
  console.log('[Murmur Detector] Detection stopped');
}

async function pauseDetection(durationMs) {
  pauseUntil = Date.now() + durationMs;
  await chrome.storage.local.set({ 'murmur_pause_until': pauseUntil });
  for (const session of getActiveSessions()) {
    pauseSession(session.domain);
  }
}

function resumeDetection() {
  pauseUntil = 0;
  chrome.storage.local.remove('murmur_pause_until');
}

function getCurrentSession() {
  if (!currentTab.domain) return null;
  return getSessionForDomain(currentTab.domain);
}

function isOnAISite() {
  if (!currentTab.domain) return false;
  return isAIDomain(currentTab.domain);
}

function getCurrentTabInfo() {
  return { ...currentTab };
}

function isDetectionPaused() {
  return Date.now() < pauseUntil;
}

function getPauseRemaining() {
  if (!isDetectionPaused()) return 0;
  return Math.max(0, Math.floor((pauseUntil - Date.now()) / 1000));
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    startDetection, stopDetection, pauseDetection, resumeDetection,
    getCurrentSession, isOnAISite, getCurrentTabInfo, isDetectionPaused, getPauseRemaining,
    currentTab, windowFocused, detectionActive,
  });
}
