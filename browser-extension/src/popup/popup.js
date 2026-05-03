/**
 * @fileoverview Murmur Popup UI Logic.
 * Displays current AI site status, session timer, quick actions, and today's stats.
 * Communicates with the background service worker via chrome.runtime.sendMessage.
 */

// ============================================================================
// State
// ============================================================================

let timerInterval = null;
let currentSessionData = null;
let statusData = null;

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  statusDot: null,
  statusLabel: null,
  statusDetail: null,
  toolName: null,
  domainText: null,
  timerSection: null,
  timerValue: null,
  actionsSection: null,
  pausedBanner: null,
  pausedRemaining: null,
  statDuration: null,
  statSessions: null,
  statEntries: null,
  statPending: null,
  statPendingCard: null,
  footerVersion: null,
};

/**
 * Cache all DOM element references.
 */
function cacheElements() {
  elements.statusDot = document.getElementById('statusDot');
  elements.statusLabel = document.getElementById('statusLabel');
  elements.statusDetail = document.getElementById('statusDetail');
  elements.toolName = document.getElementById('toolName');
  elements.domainText = document.getElementById('domainText');
  elements.timerSection = document.getElementById('timerSection');
  elements.timerValue = document.getElementById('timerValue');
  elements.actionsSection = document.getElementById('actionsSection');
  elements.pausedBanner = document.getElementById('pausedBanner');
  elements.pausedRemaining = document.getElementById('pausedRemaining');
  elements.statDuration = document.getElementById('statDuration');
  elements.statSessions = document.getElementById('statSessions');
  elements.statEntries = document.getElementById('statEntries');
  elements.statPending = document.getElementById('statPending');
  elements.statPendingCard = document.getElementById('statPendingCard');
  elements.footerVersion = document.getElementById('footerVersion');
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format seconds into HH:MM:SS or MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Format seconds into human-readable duration.
 * @param {number} seconds
 * @returns {string}
 */
function formatDurationHuman(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (m === 0) return `${h}小时`;
  return `${h}小时${m}分钟`;
}

/**
 * Format a timestamp into a relative or absolute display.
 * @param {number} remainingSeconds
 * @returns {string}
 */
function formatRemaining(remainingSeconds) {
  if (remainingSeconds <= 0) return '即将恢复';
  const m = Math.floor(remainingSeconds / 60);
  const s = Math.floor(remainingSeconds % 60);
  return `剩余 ${m}分${s}秒`;
}

/**
 * Send a message to the background service worker.
 * @param {string} action
 * @param {Object} [payload]
 * @returns {Promise<Object>}
 */
async function sendMessage(action, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({ action, payload });
  } catch (err) {
    console.error('[Murmur Popup] Message error:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// Timer
// ============================================================================

/**
 * Start the live session timer.
 * @param {number} startTime — epoch ms
 */
function startTimer(startTime) {
  stopTimer();

  function update() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    elements.timerValue.textContent = formatDuration(elapsed);
  }

  update(); // Initial update
  timerInterval = setInterval(update, 1000);
}

/**
 * Stop the live session timer.
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ============================================================================
// Pause Timer
// ============================================================================

let pauseTimerInterval = null;

/**
 * Update the pause remaining display.
 * @param {number} remainingSeconds
 */
function startPauseCountdown(remainingSeconds) {
  if (pauseTimerInterval) clearInterval(pauseTimerInterval);

  function updatePause() {
    const elapsed = (Date.now() - pauseStartTime) / 1000;
    const remaining = Math.max(0, initialPauseRemaining - elapsed);
    elements.pausedRemaining.textContent = formatRemaining(remaining);

    if (remaining <= 0) {
      clearInterval(pauseTimerInterval);
      pauseTimerInterval = null;
      refreshStatus();
    }
  }

  const pauseStartTime = Date.now();
  const initialPauseRemaining = remainingSeconds;

  updatePause();
  pauseTimerInterval = setInterval(updatePause, 1000);
}

function stopPauseCountdown() {
  if (pauseTimerInterval) {
    clearInterval(pauseTimerInterval);
    pauseTimerInterval = null;
  }
}

// ============================================================================
// UI Update
// ============================================================================

/**
 * Refresh the entire popup UI with data from background.
 */
async function refreshStatus() {
  const response = await sendMessage('getStatus');

  if (!response.success) {
    elements.statusLabel.textContent = '连接失败';
    return;
  }

  statusData = response.data;
  currentSessionData = statusData.currentSession;
  const stats = statusData.stats;

  // Update status indicator
  if (statusData.isPaused) {
    elements.statusDot.className = 'status-dot paused';
    elements.statusLabel.textContent = '检测已暂停';
    elements.statusDetail.style.display = 'none';
    elements.timerSection.style.display = 'none';
    elements.actionsSection.style.display = 'none';
    elements.pausedBanner.style.display = 'block';
    startPauseCountdown(statusData.pauseRemaining);
  } else if (statusData.isOnAISite && currentSessionData) {
    elements.statusDot.className = 'status-dot active';
    elements.statusLabel.textContent = 'AI 网站 · 使用中';
    elements.statusDetail.style.display = 'flex';
    elements.toolName.textContent = currentSessionData.toolName;
    elements.domainText.textContent = currentSessionData.domain;
    elements.timerSection.style.display = 'block';
    elements.actionsSection.style.display = 'flex';

    // Start live timer
    startTimer(currentSessionData.startTime);

    elements.pausedBanner.style.display = 'none';
    stopPauseCountdown();
  } else if (statusData.isOnAISite) {
    elements.statusDot.className = 'status-dot active';
    elements.statusLabel.textContent = 'AI 网站 · 检测中';
    elements.statusDetail.style.display = 'flex';
    elements.toolName.textContent = statusData.tabInfo?.domain || 'AI 工具';
    elements.domainText.textContent = statusData.tabInfo?.domain || '';
    elements.timerSection.style.display = 'none';
    elements.actionsSection.style.display = 'none';
    elements.pausedBanner.style.display = 'none';
    stopTimer();
    stopPauseCountdown();
  } else {
    elements.statusDot.className = 'status-dot inactive';
    elements.statusLabel.textContent = '非 AI 网站';
    elements.statusDetail.style.display = 'none';
    elements.timerSection.style.display = 'none';
    elements.actionsSection.style.display = 'none';
    elements.pausedBanner.style.display = 'none';
    stopTimer();
    stopPauseCountdown();
  }

  // Update stats
  elements.statDuration.textContent = formatDurationHuman(stats.todayDuration);
  elements.statSessions.textContent = String(stats.todaySessionCount);
  elements.statEntries.textContent = String(stats.todayEntryCount);
  elements.statPending.textContent = String(stats.pendingCount);

  if (stats.pendingCount > 0) {
    elements.statPendingCard.style.display = 'block';
  } else {
    elements.statPendingCard.style.display = 'none';
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle "Complete Session" button click.
 */
async function onCompleteSession() {
  const response = await sendMessage('quickComplete');
  if (response.success) {
    stopTimer();
    await refreshStatus();
  }
}

/**
 * Handle "Pause 1 Hour" button click.
 */
async function onPauseOneHour() {
  const response = await sendMessage('pauseOneHour');
  if (response.success) {
    stopTimer();
    await refreshStatus();
  }
}

/**
 * Handle "Ignore Domain" button click.
 */
async function onIgnoreDomain() {
  const confirmed = confirm('确定要忽略此网站吗？Murmur 将不再追踪此域名的使用情况。');
  if (!confirmed) return;

  const response = await sendMessage('ignoreDomain');
  if (response.success) {
    stopTimer();
    await refreshStatus();
  }
}

/**
 * Handle "Resume Detection" button click.
 */
async function onResumeDetection() {
  const response = await sendMessage('resumeDetection');
  if (response.success) {
    stopPauseCountdown();
    await refreshStatus();
  }
}

/**
 * Handle settings button click.
 */
function onOpenSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Handle options link click.
 */
function onLinkOptions(e) {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the popup.
 */
async function init() {
  cacheElements();

  // Set version
  const manifest = chrome.runtime.getManifest();
  elements.footerVersion.textContent = 'v' + manifest.version;

  // Bind event handlers
  document.getElementById('btnComplete').addEventListener('click', onCompleteSession);
  document.getElementById('btnPause').addEventListener('click', onPauseOneHour);
  document.getElementById('btnIgnore').addEventListener('click', onIgnoreDomain);
  document.getElementById('btnResume').addEventListener('click', onResumeDetection);
  document.getElementById('btnSettings').addEventListener('click', onOpenSettings);
  document.getElementById('linkOptions').addEventListener('click', onLinkOptions);

  // Load status
  await refreshStatus();
}

// ============================================================================
// Cleanup on close
// ============================================================================

window.addEventListener('unload', () => {
  stopTimer();
  stopPauseCountdown();
});

// Start
document.addEventListener('DOMContentLoaded', init);
