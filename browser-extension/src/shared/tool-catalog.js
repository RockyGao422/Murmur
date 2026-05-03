/**
 * @fileoverview Embedded AI Tool Catalog for Murmur Browser Extension.
 * Derived from shared/tool-catalog.json — contains 17 default AI tools
 * with their web domains and URL patterns for auto-detection.
 */

/**
 * Full tool catalog array with all 17 default AI tools.
 * @type {import('./types.js').ToolCatalogItem[]}
 */
const TOOL_CATALOG = Object.freeze([
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    aliases: ['ChatGPT', 'chatgpt', 'Chat GPT'],
    web_domains: ['chatgpt.com', 'chat.openai.com'],
    url_patterns: ['*://chatgpt.com/*', '*://chat.openai.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 1,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'claude',
    name: 'Claude',
    aliases: ['Claude', 'claude', 'Claude AI'],
    web_domains: ['claude.ai'],
    url_patterns: ['*://claude.ai/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 2,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'gemini',
    name: 'Gemini',
    aliases: ['Gemini', 'gemini', 'Google Gemini', 'Bard'],
    web_domains: ['gemini.google.com'],
    url_patterns: ['*://gemini.google.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 3,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'copilot',
    name: 'Copilot',
    aliases: ['Copilot', 'Microsoft Copilot', 'GitHub Copilot', 'Bing Chat'],
    web_domains: ['copilot.microsoft.com', 'github.com'],
    url_patterns: ['*://copilot.microsoft.com/*', '*://github.com/copilot*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 4,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    aliases: ['Cursor', 'cursor', 'Cursor IDE'],
    web_domains: [],
    url_patterns: [],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 5,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    aliases: ['Codex', 'OpenAI Codex', 'codex'],
    web_domains: ['openai.com'],
    url_patterns: ['*://openai.com/codex*', '*://platform.openai.com/codex*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 6,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    aliases: ['Perplexity', 'perplexity', 'Perplexity AI'],
    web_domains: ['perplexity.ai'],
    url_patterns: ['*://perplexity.ai/*', '*://www.perplexity.ai/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 7,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    aliases: ['Midjourney', 'midjourney', 'MJ'],
    web_domains: ['midjourney.com'],
    url_patterns: ['*://midjourney.com/*', '*://www.midjourney.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 8,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'poe',
    name: 'Poe',
    aliases: ['Poe', 'poe', 'Poe AI'],
    web_domains: ['poe.com'],
    url_patterns: ['*://poe.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 9,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    aliases: ['DeepSeek', 'Deep Seek', '深度求索'],
    web_domains: ['deepseek.com', 'chat.deepseek.com'],
    url_patterns: ['*://deepseek.com/*', '*://chat.deepseek.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 10,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'doubao',
    name: '豆包',
    aliases: ['豆包', 'Doubao', 'doubao', '字节豆包'],
    web_domains: ['doubao.com', 'www.doubao.com'],
    url_patterns: ['*://doubao.com/*', '*://www.doubao.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 11,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'kimi',
    name: 'Kimi',
    aliases: ['Kimi', 'kimi', '月之暗面', 'Moonshot'],
    web_domains: ['kimi.moonshot.cn'],
    url_patterns: ['*://kimi.moonshot.cn/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 12,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'tongyi',
    name: '通义千问',
    aliases: ['通义千问', '通义', 'Tongyi', 'Tongyi Qianwen'],
    web_domains: ['tongyi.aliyun.com'],
    url_patterns: ['*://tongyi.aliyun.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 13,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'wenxin',
    name: '文心一言',
    aliases: ['文心一言', '文心', 'Wenxin', 'ERNIE Bot'],
    web_domains: ['yiyan.baidu.com'],
    url_patterns: ['*://yiyan.baidu.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 14,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'xunfei',
    name: '讯飞星火',
    aliases: ['讯飞星火', '星火', 'iFlytek Spark', 'SparkDesk'],
    web_domains: ['xinghuo.xfyun.cn'],
    url_patterns: ['*://xinghuo.xfyun.cn/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 15,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'metaso',
    name: '秘塔',
    aliases: ['秘塔', 'Metaso', '秘塔AI', '秘塔搜索'],
    web_domains: ['metaso.cn'],
    url_patterns: ['*://metaso.cn/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 16,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
  {
    id: 'yuanbao',
    name: '元宝',
    aliases: ['元宝', 'Yuanbao', '腾讯元宝'],
    web_domains: ['yuanbao.tencent.com'],
    url_patterns: ['*://yuanbao.tencent.com/*'],
    default_enabled: true,
    detection_enabled: true,
    is_default: true,
    user_defined: false,
    sort_order: 17,
    confidence: {
      domain: 0.95,
      url_pattern: 0.90,
    },
  },
]);

/**
 * Domain → tool lookup cache. Built lazily.
 * @type {Map<string, import('./types.js').ToolCatalogItem>|null}
 */
let _domainCache = null;

/**
 * Tool ID → tool lookup cache.
 * @type {Map<string, import('./types.js').ToolCatalogItem>|null}
 */
let _idCache = null;

/**
 * Build the domain → tool lookup map.
 * Only includes tools with web_domains.
 */
function _buildDomainCache() {
  if (_domainCache) return;
  _domainCache = new Map();
  _idCache = new Map();
  for (const tool of TOOL_CATALOG) {
    _idCache.set(tool.id, tool);
    for (const domain of tool.web_domains) {
      _domainCache.set(domain, tool);
    }
  }
}

/**
 * Find a tool by exact domain match.
 * @param {string} domain — normalized hostname
 * @returns {import('./types.js').ToolCatalogItem|null}
 */
function getToolByDomain(domain) {
  _buildDomainCache();
  return _domainCache.get(domain) || null;
}

/**
 * Find a tool by its ID.
 * @param {string} id
 * @returns {import('./types.js').ToolCatalogItem|null}
 */
function getToolById(id) {
  _buildDomainCache();
  return _idCache.get(id) || null;
}

/**
 * Get all unique domains from the tool catalog.
 * Only includes tools that have web_domains and are enabled.
 * @param {Object<string, {enabled: boolean}>} [toolState] — optional enabled state per tool
 * @returns {string[]}
 */
function getAllDomains(toolState) {
  const domains = new Set();
  for (const tool of TOOL_CATALOG) {
    // Skip if tool is explicitly disabled
    if (toolState && toolState[tool.id] && !toolState[tool.id].enabled) {
      continue;
    }
    // Skip if tool is not default_enabled and no external override
    if (!tool.detection_enabled) continue;
    for (const domain of tool.web_domains) {
      domains.add(domain);
    }
  }
  return Array.from(domains);
}

/**
 * Get all tools that have web detection capabilities.
 * @param {Object<string, {enabled: boolean}>} [toolState]
 * @returns {import('./types.js').ToolCatalogItem[]}
 */
function getWebTools(toolState) {
  return TOOL_CATALOG.filter((tool) => {
    if (tool.web_domains.length === 0) return false;
    if (toolState && toolState[tool.id] && !toolState[tool.id].enabled) {
      return false;
    }
    if (!tool.detection_enabled) return false;
    return true;
  });
}

// Export to global scope for service worker (loaded via importScripts)
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    TOOL_CATALOG,
    getToolByDomain,
    getToolById,
    getAllDomains,
    getWebTools,
  });
}
