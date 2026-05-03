/**
 * @fileoverview Murmur Prompt Counter — Content Script (P1).
 * Injected on AI website pages to count user prompts/submissions.
 * Privacy-first: NO content captured, only counts.
 * Reports prompt counts to the background service worker.
 *
 * This script runs at document_idle on AI domains only.
 */

// ============================================================================
// Site-Specific Selectors
// ============================================================================

/**
 * Map of domain patterns → CSS selectors for send/submit buttons.
 * These are best-effort and will degrade gracefully if site structure changes.
 */
const SITE_SELECTORS = {
  'chatgpt.com': {
    sendButtons: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'form button[type="submit"]',
      'button.absolute.bottom-2.right-2',
      'button[data-testid="composer-speech-button"]',
    ],
    inputFields: [
      'textarea#prompt-textarea',
      'div[contenteditable="true"]#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'div.ProseMirror',
    ],
    enterSubmits: true,
  },
  'claude.ai': {
    sendButtons: [
      'button[aria-label="Send Message"]',
      'button[data-testid="send-button"]',
      'button[type="submit"]',
    ],
    inputFields: [
      'div[contenteditable="true"].ProseMirror',
      'textarea[placeholder*="message"]',
      'div[contenteditable="true"][data-placeholder]',
    ],
    enterSubmits: true,
  },
  'deepseek.com': {
    sendButtons: [
      'button[aria-label*="send" i]',
      'button[aria-label*="发送" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="消息"]',
      'textarea[placeholder*="message" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'kimi.moonshot.cn': {
    sendButtons: [
      'button[aria-label*="发送" i]',
      'button[aria-label*="send" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="输入" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'tongyi.aliyun.com': {
    sendButtons: [
      'button[aria-label*="发送" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="输入" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'yiyan.baidu.com': {
    sendButtons: [
      'button[aria-label*="发送" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="输入" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'xinghuo.xfyun.cn': {
    sendButtons: [
      'button[aria-label*="发送" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="输入" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'yuanbao.tencent.com': {
    sendButtons: [
      'button[aria-label*="发送" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="输入" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'metaso.cn': {
    sendButtons: [
      'button[aria-label*="发送" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="输入" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'doubao.com': {
    sendButtons: [
      'button[aria-label*="发送" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="输入" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'gemini.google.com': {
    sendButtons: [
      'button[aria-label*="Send" i]',
      'button[aria-label*="send" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'div[contenteditable="true"]',
      'textarea[placeholder*="Enter a prompt"]',
    ],
    enterSubmits: true,
  },
  'copilot.microsoft.com': {
    sendButtons: [
      'button[aria-label*="Send" i]',
      'button[aria-label*="Submit" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea#searchInput',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'perplexity.ai': {
    sendButtons: [
      'button[aria-label*="Submit" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="Ask" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
  'poe.com': {
    sendButtons: [
      'button[aria-label*="Send" i]',
      'button[type="submit"]',
    ],
    inputFields: [
      'textarea[placeholder*="Message" i]',
      'div[contenteditable="true"]',
    ],
    enterSubmits: true,
  },
};

// ============================================================================
// State
// ============================================================================

/**
 * Current prompt count for the active tab session.
 * Reset on navigation.
 */
let promptCount = 0;

/**
 * Whether prompt counting is active on this page.
 */
let countingEnabled = true;

/**
 * Debounce timer to prevent double-counting rapid clicks.
 */
let debounceTimer = null;
const DEBOUNCE_MS = 500;

/**
 * Current site's selectors (lazily determined).
 */
let currentSelectors = null;

// ============================================================================
// Selector Resolution
// ============================================================================

/**
 * Find the matching site configuration for the current domain.
 * @returns {Object|null}
 */
function getSiteConfig() {
  const hostname = window.location.hostname;

  for (const [domain, config] of Object.entries(SITE_SELECTORS)) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return config;
    }
  }

  // Fallback: generic AI site detection
  return {
    sendButtons: [
      'button[type="submit"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="发送" i]',
      'button[aria-label*="submit" i]',
      '[role="button"][aria-label*="send" i]',
    ],
    inputFields: [
      'textarea',
      'div[contenteditable="true"]',
      'input[type="text"]',
    ],
    enterSubmits: true,
  };
}

/**
 * Find a matching element on the page for a list of selectors.
 * @param {string[]} selectors
 * @returns {Element|null}
 */
function findElement(selectors) {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch {
      // Invalid selector — skip
    }
  }
  return null;
}

// ============================================================================
// Prompt Detection
// ============================================================================

/**
 * Report a prompt to the background service worker.
 * Debounced to prevent double-counting.
 */
function reportPrompt() {
  if (!countingEnabled) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    promptCount++;
    debounceTimer = null;

    // Send message to background
    try {
      chrome.runtime.sendMessage({
        action: 'reportPrompt',
        payload: {
          domain: window.location.hostname,
          count: promptCount,
          timestamp: Date.now(),
        },
      }).catch(() => {
        // Background may not be ready — retry on next prompt
      });
    } catch (err) {
      // Silently ignore
    }

    console.debug('[Murmur] Prompt counted:', promptCount);
  }, DEBOUNCE_MS);
}

/**
 * Handle send button click.
 * @param {Event} event
 */
function onSendButtonClick(event) {
  // Only count primary button clicks (not right-click, etc.)
  if (event.button !== 0) return;

  const button = event.target.closest('button, [role="button"]');
  if (!button) return;

  // Check if it looks like a send button
  const text = (button.textContent || '').toLowerCase().trim();
  const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
  const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';

  // Skip disabled buttons or non-send buttons
  if (isDisabled) return;

  const isSendButton =
    text.includes('send') ||
    text.includes('submit') ||
    text.includes('发送') ||
    text.includes('提交') ||
    ariaLabel.includes('send') ||
    ariaLabel.includes('submit') ||
    ariaLabel.includes('发送') ||
    ariaLabel.includes('提交');

  if (!isSendButton) return;

  reportPrompt();
}

/**
 * Handle Enter key in input fields.
 * @param {KeyboardEvent} event
 */
function onKeyDown(event) {
  if (!currentSelectors || !currentSelectors.enterSubmits) return;
  if (event.key !== 'Enter') return;

  // Skip if Shift+Enter (usually newline)
  if (event.shiftKey) return;

  // Skip if Ctrl+Enter or Meta+Enter
  if (event.ctrlKey || event.metaKey) return;

  // Check if the target is an input field
  const target = event.target;
  let isInputField = false;

  if (target.tagName === 'TEXTAREA') {
    isInputField = true;
  } else if (target.tagName === 'INPUT' && target.type === 'text') {
    isInputField = true;
  } else if (target.getAttribute('contenteditable') === 'true') {
    isInputField = true;
  } else if (target.closest('[contenteditable="true"]')) {
    isInputField = true;
  }

  if (!isInputField) return;

  reportPrompt();
}

/**
 * Handle mutation observer to detect response completions.
 * Some sites regenerate the send button after each response.
 */
function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check if a new send button was added (site regenerated after response)
          if (currentSelectors) {
            const matchFound = currentSelectors.sendButtons.some((sel) => {
              try {
                return node.matches?.(sel) || node.querySelector?.(sel);
              } catch {
                return false;
              }
            });

            if (matchFound) {
              // Re-attach listeners to the new button
              attachSendButtonListeners();
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================================================
// Listener Attachment
// ============================================================================

/**
 * Attach click listeners to send buttons on the page.
 */
function attachSendButtonListeners() {
  if (!currentSelectors) return;

  const sendButtons = [];
  for (const selector of currentSelectors.sendButtons) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (!sendButtons.includes(el)) {
          sendButtons.push(el);
        }
      }
    } catch {
      // Invalid selector
    }
  }

  // Use event delegation on document for better coverage
  // This also catches dynamically added buttons
  document.addEventListener('click', onSendButtonClick, true);

  console.debug('[Murmur] Send button listeners attached, found', sendButtons.length, 'buttons');
}

/**
 * Attach keyboard listeners to input fields.
 */
function attachInputListeners() {
  if (!currentSelectors) return;

  // Attach keydown listener to all input fields
  for (const selector of currentSelectors.inputFields) {
    try {
      const inputs = document.querySelectorAll(selector);
      for (const input of inputs) {
        input.addEventListener('keydown', onKeyDown, true);
      }
    } catch {
      // Invalid selector
    }
  }

  // Also use event delegation for dynamically added inputs
  document.addEventListener('keydown', onKeyDown, true);

  console.debug('[Murmur] Input listeners attached');
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the prompt counter.
 */
function initPromptCounter() {
  const hostname = window.location.hostname;
  console.debug('[Murmur] Initializing prompt counter for:', hostname);

  currentSelectors = getSiteConfig();
  if (!currentSelectors) {
    console.debug('[Murmur] No site config found for:', hostname);
    return;
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      attachSendButtonListeners();
      attachInputListeners();
      setupMutationObserver();
    });
  } else {
    attachSendButtonListeners();
    attachInputListeners();
    setupMutationObserver();
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPromptCount') {
      sendResponse({ success: true, count: promptCount });
    } else if (message.action === 'resetPromptCount') {
      promptCount = 0;
      sendResponse({ success: true });
    } else if (message.action === 'togglePromptCounting') {
      countingEnabled = message.payload?.enabled ?? !countingEnabled;
      sendResponse({ success: true, enabled: countingEnabled });
    }
    return true;
  });

  console.debug('[Murmur] Prompt counter initialized');
}

// ============================================================================
// Start
// ============================================================================

// Check if prompt counting should be enabled for this site
// We check extension settings via storage
(async function checkEnabled() {
  try {
    const result = await chrome.storage.local.get('murmur_settings');
    const settings = result['murmur_settings'] || {};
    if (settings.promptCountingEnabled === false) {
      console.debug('[Murmur] Prompt counting disabled in settings');
      return;
    }
  } catch (err) {
    // Proceed with counting if we can't read settings
  }

  initPromptCounter();
})();

// Report initial prompt count to background
window.addEventListener('beforeunload', () => {
  if (promptCount > 0) {
    try {
      chrome.runtime.sendMessage({
        action: 'reportPrompt',
        payload: {
          domain: window.location.hostname,
          count: promptCount,
          timestamp: Date.now(),
          final: true,
        },
      }).catch(() => {});
    } catch (err) {
      // Silently ignore
    }
  }
});
