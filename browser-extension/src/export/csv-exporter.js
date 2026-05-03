/**
 * @fileoverview CSV Exporter for Murmur Browser Extension.
 * Generates properly-escaped CSV strings and triggers file downloads.
 * Can be used from both popup/options (direct download) and background (return CSV string).
 */

/**
 * Escape a value for CSV.
 * Handles commas, quotes, and newlines.
 *
 * @param {*} value
 * @returns {string}
 */
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);

  // If contains comma, quote, or newline, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Generate a CSV string from an array of objects.
 *
 * @param {Object[]} data — array of objects
 * @param {string[]} columns — column keys to include
 * @param {string[]} [headers] — column header names (defaults to keys)
 * @returns {string}
 */
function generateCSV(data, columns, headers) {
  const headerRow = (headers || columns).map(csvEscape).join(',');
  const dataRows = data.map((row) => {
    return columns.map((col) => csvEscape(row[col])).join(',');
  });
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Generate a CSV string from detected sessions.
 *
 * @param {Object[]} sessions
 * @returns {string}
 */
function exportSessionsCSV(sessions) {
  if (!sessions || sessions.length === 0) {
    return 'ID,工具,域名,URL,开始时间,结束时间,时长(秒),状态,Prompt数,备注\n';
  }

  const columns = [
    'id', 'toolName', 'domain', 'url',
    'startTime', 'endTime', 'duration', 'status',
    'promptCount', 'notes',
  ];

  const headers = [
    'ID', '工具', '域名', 'URL',
    '开始时间', '结束时间', '时长(秒)', '状态',
    'Prompt数', '备注',
  ];

  const rows = sessions.map((s) => ({
    id: s.id || '',
    toolName: s.toolName || '',
    domain: s.domain || '',
    url: s.url || '',
    startTime: s.startTime ? new Date(s.startTime).toISOString() : '',
    endTime: s.endTime ? new Date(s.endTime).toISOString() : '',
    duration: s.duration || 0,
    status: s.status || '',
    promptCount: s.promptCount || 0,
    notes: s.notes || '',
  }));

  return generateCSV(rows, columns, headers);
}

/**
 * Generate a CSV string from ledger entries.
 *
 * @param {Object[]} entries
 * @returns {string}
 */
function exportEntriesCSV(entries) {
  if (!entries || entries.length === 0) {
    const cols = [
      'ID', '会话ID', '工具', '时长(秒)', '质量评分', '质量惩罚',
      '额外成本(秒)', '净收益(小时)', '心情', '心情权重',
      '输出质量', '类型', '有返工', '总结', 'Prompt数', '创建时间',
    ];
    return cols.join(',') + '\n';
  }

  const columns = [
    'id', 'sessionId', 'toolName', 'duration',
    'qualityScore', 'qualityPenalty', 'totalExtraCost',
    'netGain', 'mood', 'moodWeight',
    'outputQuality', 'sourceKind', 'hasRework',
    'summary', 'promptCount', 'createdAt',
  ];

  const headers = [
    'ID', '会话ID', '工具', '时长(秒)',
    '质量评分', '质量惩罚', '额外成本(秒)',
    '净收益(小时)', '心情', '心情权重',
    '输出质量', '类型', '有返工',
    '总结', 'Prompt数', '创建时间',
  ];

  const rows = entries.map((e) => ({
    id: e.id || '',
    sessionId: e.sessionId || '',
    toolName: e.toolName || '',
    duration: e.duration || 0,
    qualityScore: e.qualityScore ?? '',
    qualityPenalty: e.qualityPenalty ?? '',
    totalExtraCost: e.totalExtraCost ?? '',
    netGain: e.netGain ?? '',
    mood: e.mood || '',
    moodWeight: e.moodWeight ?? '',
    outputQuality: e.outputQuality || '',
    sourceKind: e.sourceKind || '',
    hasRework: e.hasRework ? '是' : '否',
    summary: e.summary || '',
    promptCount: e.promptCount ?? '',
    createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : '',
  }));

  return generateCSV(rows, columns, headers);
}

/**
 * Trigger a file download in the browser.
 * This function only works when called from a page context (popup/options),
 * NOT from the background service worker.
 *
 * @param {string} content — file content
 * @param {string} filename
 * @param {string} [mimeType] — defaults to 'text/csv;charset=utf-8'
 */
function downloadCSV(content, filename, mimeType = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content, { type: mimeType }]); // BOM for Excel compatibility
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Generate and download sessions CSV.
 *
 * @param {Object[]} sessions
 * @param {string} [dateStr] — date string for filename
 */
function downloadSessionsCSV(sessions, dateStr) {
  const csv = exportSessionsCSV(sessions);
  const date = dateStr || new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `murmur-sessions-${date}.csv`);
}

/**
 * Generate and download entries CSV.
 *
 * @param {Object[]} entries
 * @param {string} [dateStr]
 */
function downloadEntriesCSV(entries, dateStr) {
  const csv = exportEntriesCSV(entries);
  const date = dateStr || new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `murmur-entries-${date}.csv`);
}

/**
 * Export data as JSON string.
 *
 * @param {Object} data
 * @returns {string}
 */
function exportJSON(data) {
  return JSON.stringify(data, null, 2);
}

// Export to global scope
if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    csvEscape,
    generateCSV,
    exportSessionsCSV,
    exportEntriesCSV,
    downloadCSV,
    downloadSessionsCSV,
    downloadEntriesCSV,
    exportJSON,
  });
}
