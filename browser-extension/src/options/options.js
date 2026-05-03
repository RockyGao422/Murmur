/**
 * @fileoverview Murmur Options Page Logic.
 * Full settings UI: tool toggles, custom domains, ignored domains,
 * data export, clear data, privacy info.
 */

// ============================================================================
// Helpers
// ============================================================================

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
    console.error('[Murmur Options] Message error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} [type]
 */
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

/**
 * Format a date for display.
 * @param {number} timestamp — epoch ms
 * @returns {string}
 */
function formatDate(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Download a string as a file.
 * @param {string} content
 * @param {string} filename
 * @param {string} mimeType
 */
function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Tool Toggles
// ============================================================================

/**
 * Create a toggle switch element.
 * @param {boolean} checked
 * @param {boolean} [disabled]
 * @returns {HTMLLabelElement}
 */
function createToggle(checked, disabled = false) {
  const label = document.createElement('label');
  label.className = 'toggle';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = disabled;

  const span = document.createElement('span');
  span.className = 'toggle-slider';

  label.appendChild(input);
  label.appendChild(span);
  return label;
}

/**
 * Render the tools list.
 * @param {Array} tools
 */
function renderTools(tools) {
  const container = document.getElementById('toolsList');
  container.innerHTML = '';

  tools
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((tool) => {
      const hasWeb = tool.web_domains && tool.web_domains.length > 0;

      const item = document.createElement('div');
      item.className = 'tool-item';

      const info = document.createElement('div');
      info.className = 'tool-info';

      const name = document.createElement('span');
      name.className = 'tool-item-name';
      name.textContent = tool.name;

      const domains = document.createElement('span');
      domains.className = 'tool-item-domains';
      domains.textContent = hasWeb
        ? tool.web_domains.join(', ')
        : '无网页版本';

      info.appendChild(name);
      info.appendChild(domains);

      const right = document.createElement('div');
      right.className = 'tool-item-right';

      if (!hasWeb) {
        const badge = document.createElement('span');
        badge.className = 'tool-badge no-web';
        badge.textContent = '仅桌面';
        right.appendChild(badge);
      }

      const toggle = createToggle(tool.enabled !== false, !hasWeb);
      if (hasWeb) {
        toggle.querySelector('input').addEventListener('change', (e) => {
          onToggleTool(tool.id, e.target.checked);
        });
      }
      right.appendChild(toggle);

      item.appendChild(info);
      item.appendChild(right);
      container.appendChild(item);
    });
}

/**
 * Handle tool toggle change.
 * @param {string} toolId
 * @param {boolean} enabled
 */
async function onToggleTool(toolId, enabled) {
  const response = await sendMessage('toggleTool', { toolId, enabled });
  if (response.success) {
    showToast(`${enabled ? '已启用' : '已禁用'}`, 'success');
  } else {
    showToast('操作失败', 'error');
  }
}

// ============================================================================
// Custom Domains
// ============================================================================

/**
 * Render the custom domains list.
 * @param {string[]} domains
 */
function renderCustomDomains(domains) {
  const container = document.getElementById('customDomainsList');
  container.innerHTML = '';

  if (domains.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无自定义域名</p>';
    return;
  }

  domains.forEach((domain) => {
    const tag = document.createElement('span');
    tag.className = 'domain-tag';
    tag.innerHTML = `${domain}<button class="remove-tag" data-domain="${domain}">&times;</button>`;

    tag.querySelector('.remove-tag').addEventListener('click', async () => {
      await sendMessage('removeCustomDomain', { domain });
      await loadToolsTab();
      showToast(`已移除 ${domain}`, 'info');
    });

    container.appendChild(tag);
  });
}

/**
 * Handle add custom domain.
 */
async function onAddCustomDomain() {
  const input = document.getElementById('customDomainInput');
  const domain = input.value.trim().toLowerCase();

  if (!domain) {
    showToast('请输入域名', 'error');
    return;
  }

  // Basic domain validation
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
  if (!domainRegex.test(domain)) {
    showToast('请输入有效的域名 (例如: example.com)', 'error');
    return;
  }

  const response = await sendMessage('addCustomDomain', { domain });
  if (response.success) {
    input.value = '';
    await loadToolsTab();
    showToast(`已添加 ${domain}`, 'success');
  } else {
    showToast('添加失败', 'error');
  }
}

// ============================================================================
// Ignored Domains
// ============================================================================

/**
 * Render the ignored domains list.
 * @param {Array} ignored
 */
function renderIgnoredDomains(ignored) {
  const container = document.getElementById('ignoredList');
  container.innerHTML = '';

  if (ignored.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无忽略的网站</p>';
    return;
  }

  ignored
    .sort((a, b) => b.addedAt - a.addedAt)
    .forEach((item) => {
      const row = document.createElement('div');
      row.className = 'ignored-item';

      const info = document.createElement('div');
      info.innerHTML = `
        <span class="ignored-domain">${item.domain}</span>
        <span class="ignored-date">添加于 ${formatDate(item.addedAt)}</span>
      `;

      const actions = document.createElement('div');
      actions.className = 'ignored-actions';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-sm remove';
      removeBtn.textContent = '移除';
      removeBtn.addEventListener('click', async () => {
        await onRemoveIgnored(item.domain);
      });

      actions.appendChild(removeBtn);
      row.appendChild(info);
      row.appendChild(actions);
      container.appendChild(row);
    });
}

/**
 * Handle remove ignored domain.
 * @param {string} domain
 */
async function onRemoveIgnored(domain) {
  const response = await sendMessage('removeIgnoredDomain', { domain });
  if (response.success) {
    await loadIgnoredTab();
    showToast(`已移除 ${domain}`, 'success');
  } else {
    showToast('操作失败', 'error');
  }
}

// ============================================================================
// Data Export
// ============================================================================

/**
 * Export sessions as CSV.
 */
async function onExportSessions() {
  const response = await sendMessage('getSessions');
  if (!response.success || !response.data) {
    showToast('导出失败', 'error');
    return;
  }

  const sessions = response.data;
  const headers = [
    'ID', '工具', '域名', 'URL', '开始时间', '结束时间',
    '时长(秒)', '状态', '检测方式', 'Prompt数', '备注',
  ];
  const rows = sessions.map((s) => [
    s.id,
    `"${s.toolName || ''}"`,
    s.domain,
    `"${s.url || ''}"`,
    new Date(s.startTime).toISOString(),
    s.endTime ? new Date(s.endTime).toISOString() : '',
    s.duration,
    s.status,
    s.detectionStatus,
    s.promptCount || 0,
    `"${(s.notes || '').replace(/"/g, '""')}"`,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(csv, `murmur-sessions-${date}.csv`, 'text/csv;charset=utf-8');
  showToast('导出成功', 'success');
}

/**
 * Export entries as CSV.
 */
async function onExportEntries() {
  const response = await sendMessage('getEntries');
  if (!response.success || !response.data) {
    showToast('导出失败', 'error');
    return;
  }

  const entries = response.data;
  const headers = [
    'ID', '会话ID', '工具', '时长(秒)', '质量评分',
    '质量惩罚', '额外成本', '净收益(H)', '心情', '心情权重',
    '输出质量', '类型', '有返工', '总结', 'Prompt数',
  ];
  const rows = entries.map((e) => [
    e.id,
    e.sessionId,
    `"${e.toolName || ''}"`,
    e.duration,
    e.qualityScore || '',
    e.qualityPenalty || '',
    e.extraCostFraction || '',
    e.netGain || '',
    e.mood || '',
    e.moodWeight || '',
    e.outputQuality || '',
    e.sourceKind || '',
    e.hasRework ? '是' : '否',
    `"${(e.summary || '').replace(/"/g, '""')}"`,
    e.promptCount || '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(csv, `murmur-entries-${date}.csv`, 'text/csv;charset=utf-8');
  showToast('导出成功', 'success');
}

/**
 * Export all data as JSON.
 */
async function onExportAll() {
  const response = await sendMessage('exportData');
  if (!response.success || !response.data) {
    showToast('导出失败', 'error');
    return;
  }

  const json = JSON.stringify(response.data, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(json, `murmur-all-data-${date}.json`, 'application/json');
  showToast('导出成功', 'success');
}

/**
 * Clear all data.
 */
async function onClearData() {
  const confirmed = confirm(
    '确定要清除所有数据吗？\n\n' +
    '这将删除所有检测会话、记录和统计信息。此操作不可撤销。'
  );

  if (!confirmed) return;

  const doubleConfirm = confirm(
    '再次确认：真的要清除所有 Murmur 数据吗？'
  );

  if (!doubleConfirm) return;

  const response = await sendMessage('clearAllData');
  if (response.success) {
    showToast('所有数据已清除', 'success');
    await loadAll();
  } else {
    showToast('清除失败', 'error');
  }
}

// ============================================================================
// Tab Loading
// ============================================================================

/**
 * Load the tools tab.
 */
async function loadToolsTab() {
  const [toolResponse, settingsResponse] = await Promise.all([
    sendMessage('getToolCatalog'),
    sendMessage('getSettings'),
  ]);

  const tools = toolResponse.success ? toolResponse.data : [];
  const settings = settingsResponse.success ? settingsResponse.data : { customDomains: [] };

  renderTools(tools);
  renderCustomDomains(settings.customDomains || []);
}

/**
 * Load the ignored tab.
 */
async function loadIgnoredTab() {
  const response = await sendMessage('getIgnoredDomains');
  const ignored = response.success ? response.data : [];
  renderIgnoredDomains(ignored);
}

/**
 * Load the data tab.
 */
async function loadDataTab() {
  try {
    const response = await sendMessage('exportData');
    if (response.success && response.data) {
      const data = response.data;
      const totalItems =
        (data.sessions?.length || 0) +
        (data.entries?.length || 0) +
        (data.summaries?.length || 0);
      const storageInfo = document.getElementById('storageInfo');
      storageInfo.innerHTML = `<span>存储用量: ${totalItems} 条记录</span>`;
    }
  } catch (err) {
    // ignore
  }
}

/**
 * Load all tabs data.
 */
async function loadAll() {
  await Promise.all([
    loadToolsTab(),
    loadIgnoredTab(),
    loadDataTab(),
  ]);
}

// ============================================================================
// Tab Switching
// ============================================================================

/**
 * Switch to a tab.
 * @param {string} tabName
 */
function switchTab(tabName) {
  // Update buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update content
  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });

  // Load data for the tab
  switch (tabName) {
    case 'tools':
      loadToolsTab();
      break;
    case 'ignored':
      loadIgnoredTab();
      break;
    case 'data':
      loadDataTab();
      break;
  }
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the options page.
 */
function init() {
  // Set version
  const manifest = chrome.runtime.getManifest();
  document.getElementById('versionDisplay').textContent = 'v' + manifest.version;

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Add custom domain
  document.getElementById('btnAddDomain').addEventListener('click', onAddCustomDomain);
  document.getElementById('customDomainInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') onAddCustomDomain();
  });

  // Export buttons
  document.getElementById('btnExportSessions').addEventListener('click', onExportSessions);
  document.getElementById('btnExportEntries').addEventListener('click', onExportEntries);
  document.getElementById('btnExportAll').addEventListener('click', onExportAll);

  // Clear data
  document.getElementById('btnClearData').addEventListener('click', onClearData);

  // Load initial data
  loadAll();
}

document.addEventListener('DOMContentLoaded', init);
