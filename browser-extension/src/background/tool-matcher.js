/**
 * @fileoverview Domain/URL matching engine for Murmur Browser Extension.
 * Matches browsing events against the tool catalog to identify AI website usage.
 * Privacy-first: only examines hostname + path, never query parameters.
 */

/**
 * Simple UUID generator (crypto.randomUUID not available in all service worker contexts).
 * @returns {string}
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Extract domain (hostname) from a URL string.
 * @param {string} url
 * @returns {string|null}
 */
function getDomainFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Normalize a hostname by stripping 'www.' prefix.
 * @param {string} hostname
 * @returns {string}
 */
function normalizeHostname(hostname) {
  return hostname.replace(/^www\./, '').toLowerCase();
}

/**
 * Extract the URL path + hostname (no query, no hash).
 * Privacy-first: never store full URL with query params.
 * @param {string} url
 * @returns {{hostname: string, path: string, full: string}|null}
 */
function extractCleanUrl(url) {
  try {
    const parsed = new URL(url);
    return {
      hostname: parsed.hostname,
      path: parsed.pathname,
      full: parsed.origin + parsed.pathname,
    };
  } catch {
    return null;
  }
}

/**
 * Convert a glob-style URL pattern (*://domain/path*) to a RegExp.
 * @param {string} pattern — e.g. '*://chatgpt.com/*' or '*://github.com/copilot*'
 * @returns {RegExp}
 */
function patternToRegex(pattern) {
  // Escape special regex chars, then replace * with appropriate wildcards
  let escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, 'WILDCARD');
  // *:// → match any protocol
  escaped = escaped.replace('WILDCARD://', '[a-z][a-z0-9+.-]*://');
  // /* → match any path
  escaped = escaped.replace('/WILDCARD', '/.*');
  // Trailing * → match remaining
  escaped = escaped.replace(/WILDCARD/g, '.*');
  return new RegExp('^' + escaped + '$', 'i');
}

/**
 * Check if a URL matches a glob pattern.
 * @param {string} url
 * @param {string} pattern
 * @returns {boolean}
 */
function urlMatchesPattern(url, pattern) {
  try {
    const regex = patternToRegex(pattern);
    return regex.test(url);
  } catch {
    return false;
  }
}

/**
 * Perform fuzzy domain matching as a fallback.
 * Checks if domain contains the AI tool's primary domain keyword.
 * Low confidence — used only when exact match fails.
 * @param {string} domain
 * @param {import('../shared/types.js').ToolCatalogItem} tool
 * @returns {{matched: boolean, matchKey: string|null, confidence: number}}
 */
function fuzzyMatch(domain, tool) {
  const normalized = normalizeHostname(domain);

  for (const toolDomain of tool.web_domains) {
    const normalizedTool = normalizeHostname(toolDomain);
    // Check if the tool's primary domain is a substring of the current domain
    // e.g. "chat.deepseek.com" contains "deepseek"
    const parts = normalizedTool.split('.');
    if (parts.length >= 2) {
      const primaryName = parts[parts.length - 2]; // e.g. "deepseek" from "deepseek.com"
      if (primaryName.length > 3 && normalized.includes(primaryName)) {
        return { matched: true, matchKey: primaryName, confidence: 0.50 };
      }
    }
    // Direct substring fallback
    if (normalized.includes(normalizedTool)) {
      return { matched: true, matchKey: normalizedTool, confidence: 0.60 };
    }
  }

  return { matched: false, matchKey: null, confidence: 0 };
}

/**
 * Check if a domain is in the ignored domains list.
 * @param {string} domain
 * @param {import('../shared/types.js').IgnoredTarget[]} ignoredDomains
 * @returns {boolean}
 */
function isDomainIgnored(domain, ignoredDomains) {
  const normalized = normalizeHostname(domain);
  return ignoredDomains.some(
    (ignored) => normalizeHostname(ignored.domain) === normalized
  );
}

/**
 * Match a browsing event against the tool catalog.
 * This is the main entry point for tool detection.
 *
 * @param {import('../shared/types.js').RawEvent} rawEvent
 * @param {Object<string, {enabled: boolean}>} [toolState]
 * @returns {Promise<import('../shared/types.js').MatchResult>}
 */
async function matchEvent(rawEvent, toolState) {
  const url = rawEvent.url;
  const domain = rawEvent.domain;

  // No URL or domain → can't match
  if (!url || !domain) {
    return {
      tool: null,
      confidence: 0,
      matchedRule: null,
      shouldIgnore: false,
      needsConfirmation: false,
    };
  }

  // Check ignored domains
  const ignoredDomains = await getIgnoredDomains();
  if (isDomainIgnored(domain, ignoredDomains)) {
    return {
      tool: null,
      confidence: 0,
      matchedRule: null,
      shouldIgnore: true,
      needsConfirmation: false,
    };
  }

  const normalizedDomain = normalizeHostname(domain);
  const webTools = getWebTools(toolState);

  // Phase 1: Exact domain match (highest confidence)
  for (const tool of webTools) {
    for (const toolDomain of tool.web_domains) {
      if (normalizeHostname(toolDomain) === normalizedDomain) {
        return {
          tool: tool,
          confidence: tool.confidence.domain,
          matchedRule: `domain:${toolDomain}`,
          shouldIgnore: false,
          needsConfirmation: false,
        };
      }
    }
  }

  // Phase 2: URL pattern match
  for (const tool of webTools) {
    for (const pattern of tool.url_patterns) {
      if (urlMatchesPattern(url, pattern)) {
        return {
          tool: tool,
          confidence: tool.confidence.url_pattern,
          matchedRule: `pattern:${pattern}`,
          shouldIgnore: false,
          needsConfirmation: false,
        };
      }
    }
  }

  // Phase 3: Fuzzy domain match (low confidence, needs user confirmation)
  for (const tool of webTools) {
    if (tool.web_domains.length === 0) continue;
    const fuzzy = fuzzyMatch(domain, tool);
    if (fuzzy.matched) {
      return {
        tool: tool,
        confidence: fuzzy.confidence,
        matchedRule: `fuzzy:${fuzzy.matchKey}`,
        shouldIgnore: false,
        needsConfirmation: true,
      };
    }
  }

  // No match
  return {
    tool: null,
    confidence: 0,
    matchedRule: null,
    shouldIgnore: false,
    needsConfirmation: false,
  };
}

/**
 * Quick check: is this domain known to be an AI site?
 * Does NOT check ignored list — that's done at match time.
 * @param {string} domain
 * @param {Object<string, {enabled: boolean}>} [toolState]
 * @returns {boolean}
 */
function isAIDomain(domain, toolState) {
  if (!domain) return false;
  const normalized = normalizeHostname(domain);
  const webTools = getWebTools(toolState);

  for (const tool of webTools) {
    for (const toolDomain of tool.web_domains) {
      if (normalizeHostname(toolDomain) === normalized) {
        return true;
      }
    }
    // Also check URL patterns loosely
    for (const pattern of tool.url_patterns) {
      try {
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, 'WILDCARD')
          .replace('WILDCARD://', '[a-z][a-z0-9+.-]*://')
          .replace('/WILDCARD', '/.*')
          .replace(/WILDCARD/g, '.*');
        const regex = new RegExp('^' + escaped + '$', 'i');
        // Test against a phantom URL
        if (regex.test(`https://${domain}/`)) {
          return true;
        }
      } catch {
        // ignore
      }
    }
  }

  return false;
}

/**
 * Get all host_permission patterns needed for the manifest.
 * @returns {string[]}
 */
function getAllHostPermissionPatterns() {
  const patterns = new Set();
  for (const tool of TOOL_CATALOG) {
    if (!tool.detection_enabled) continue;
    for (const domain of tool.web_domains) {
      // Determine if we need subdomain wildcard
      const parts = domain.split('.');
      if (parts.length > 2) {
        // Specific subdomain like chat.openai.com → exact match pattern
        patterns.add(`*://${domain}/*`);
      } else {
        // Second-level domain like chatgpt.com → include www
        patterns.add(`*://*.${domain}/*`);
        patterns.add(`*://${domain}/*`);
      }
    }
  }
  return Array.from(patterns).sort();
}

// Export to global scope for service worker
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    generateUUID,
    getDomainFromUrl,
    normalizeHostname,
    extractCleanUrl,
    patternToRegex,
    urlMatchesPattern,
    fuzzyMatch,
    matchEvent,
    isAIDomain,
    isDomainIgnored,
    getAllHostPermissionPatterns,
  });
}
