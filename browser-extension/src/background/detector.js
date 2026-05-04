/**
 * @fileoverview Browser event detector for Murmur Browser Extension.
 * Privacy-first: only domain and URL patterns are captured, never full URLs or page titles.
 * Tracks multiple AI tabs via activeTabs Map keyed by "windowId:tabId".
 * Canonical event types aligned with shared/schemas/raw-event.schema.json.
 */

// ============================================================================
// State
// ============================================================================

let activeTabs = new Map();           // "windowId:tabId" → { tabId, windowId, domain, urlPattern }
let currentActiveTabKey = null;       // "windowId:tabId" of the foreground tab
let windowFocused = true;
let detectionActive = false;
let pauseUntil = 0;

// ============================================================================
// URL Normalization
// ============================================================================

function normalizeUrl(rawUrl) {
  if (!rawUrl) return { domain: null, urlPattern: null };
  try {
    const u = new URL(rawUrl);
    const domain = u.hostname.replace(/^www\./, '');
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
// RawEvent Factory
// ============================================================================

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
    metadata,
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

async function onTabActivated(activeInfo) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (chrome.runtime.lastError || !tab || tab.incognito) return;
    const url = tab.url || tab.pendingUrl || null;
    const { domain, urlPattern } = normalizeUrl(url);
    const newKey = makeKey(tab.windowId, tab.id);

    // Track this tab
    activeTabs.set(newKey, { tabId: tab.id, windowId: tab.windowId, domain, urlPattern });

    // Pause previous foreground tab's session
    if (currentActiveTabKey && currentActiveTabKey !== newKey && windowFocused) {
      const prevTab = activeTabs.get(currentActiveTabKey);
      if (prevTab) {
        const prevEvent = createRawEvent(EventType.TAB_ACTIVATED, prevTab.tabId, prevTab.windowId, prevTab.domain, prevTab.urlPattern, false,
          { previousDomain: prevTab.domain });
        prevEvent.eventType = EventType.WINDOW_FOCUS_CHANGED;
        prevEvent.metadata = { focused: false };
        await processEvent(prevEvent);
      }
    }

    // Activate new tab
    currentActiveTabKey = newKey;
    if (windowFocused) {
      const rawEvent = createRawEvent(EventType.TAB_ACTIVATED, tab.id, tab.windowId, domain, urlPattern, false, {});
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
  const key = makeKey(tab.windowId, tabId);

  // Update tracking
  activeTabs.set(key, { tabId, windowId: tab.windowId, domain, urlPattern });

  if (windowFocused && tab.active && currentActiveTabKey === key) {
    const rawEvent = createRawEvent(EventType.TAB_UPDATED, tabId, tab.windowId, domain, urlPattern, false,
      { status: changeInfo.status });
    await processEvent(rawEvent);
  }
}

async function onTabRemoved(tabId, removeInfo) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  if (removeInfo.isWindowClosing) return;

  const key = makeKey(removeInfo.windowId, tabId);
  const tabInfo = activeTabs.get(key);
  if (!tabInfo) return;

  const rawEvent = createRawEvent(EventType.TAB_REMOVED, tabId, removeInfo.windowId, tabInfo.domain, tabInfo.urlPattern, false);
  await processEvent(rawEvent);

  activeTabs.delete(key);
  if (currentActiveTabKey === key) currentActiveTabKey = null;
}

async function onWindowFocusChanged(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    windowFocused = false;
    if (currentActiveTabKey) {
      const tabInfo = activeTabs.get(currentActiveTabKey);
      const rawEvent = createRawEvent(EventType.WINDOW_FOCUS_CHANGED, tabInfo?.tabId || 0, 0, tabInfo?.domain || null, tabInfo?.urlPattern || null, false, { focused: false });
      await processEvent(rawEvent);
    }
  } else {
    windowFocused = true;
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs.length > 0 && !tabs[0].incognito) {
        const { domain, urlPattern } = normalizeUrl(tabs[0].url);
        const newKey = makeKey(tabs[0].windowId, tabs[0].id);
        activeTabs.set(newKey, { tabId: tabs[0].id, windowId: tabs[0].windowId, domain, urlPattern });
        currentActiveTabKey = newKey;
      }
    } catch (_) { /* ignore */ }
    const tabInfo = currentActiveTabKey ? activeTabs.get(currentActiveTabKey) : null;
    const rawEvent = createRawEvent(EventType.WINDOW_FOCUS_CHANGED, tabInfo?.tabId || 0, windowId, tabInfo?.domain || null, tabInfo?.urlPattern || null, false, { focused: true });
    await processEvent(rawEvent);
  }
}

async function onNavigationCommitted(details) {
  if (!detectionActive || Date.now() < pauseUntil) return;
  if (details.frameId !== 0) return;

  const { domain, urlPattern } = normalizeUrl(details.url);
  const key = makeKey(details.windowId || 0, details.tabId);
  const previousDomain = activeTabs.get(key)?.domain || null;

  // Track this tab
  activeTabs.set(key, { tabId: details.tabId, windowId: details.windowId || 0, domain, urlPattern });

  if (windowFocused && currentActiveTabKey === key) {
    const rawEvent = createRawEvent(EventType.NAVIGATION_COMMITTED, details.tabId, details.windowId || 0, domain, urlPattern, false,
      { transitionType: details.transitionType, previousDomain: previousDomain !== domain ? previousDomain : null });
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
      const key = makeKey(tabs[0].windowId, tabs[0].id);
      activeTabs.set(key, { tabId: tabs[0].id, windowId: tabs[0].windowId, domain, urlPattern });
      currentActiveTabKey = key;
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
  for (const [key] of activeSessions) {
    pauseSession(key);
  }
}

function resumeDetection() {
  pauseUntil = 0;
  chrome.storage.local.remove('murmur_pause_until');
}

function getCurrentSession() {
  if (!currentActiveTabKey) return null;
  return getSessionForKey(currentActiveTabKey);
}

function isOnAISite() {
  if (!currentActiveTabKey) return false;
  const tabInfo = activeTabs.get(currentActiveTabKey);
  if (!tabInfo?.domain) return false;
  return isAIDomain(tabInfo.domain);
}

function getCurrentTabInfo() {
  if (!currentActiveTabKey) return { tabId: null, windowId: null, domain: null, urlPattern: null, isIncognito: false };
  const tabInfo = activeTabs.get(currentActiveTabKey);
  return {
    tabId: tabInfo?.tabId || null,
    windowId: tabInfo?.windowId || null,
    domain: tabInfo?.domain || null,
    urlPattern: tabInfo?.urlPattern || null,
    isIncognito: false,
  };
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
    windowFocused, detectionActive, activeTabs, currentActiveTabKey,
  });
}
