/**
 * @fileoverview CSV Exporter for Murmur Browser Extension.
 * Privacy-first: exports only approved fields (domain/urlPattern, NOT full URL).
 * Aligned with shared/schemas/ CSV export specification.
 */

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCSV(data, columns, headers) {
  const headerRow = (headers || columns).map(csvEscape).join(',');
  const dataRows = data.map(row => columns.map(col => csvEscape(row[col])).join(','));
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Export detected sessions CSV — aligned with shared schema export fields.
 * NO full URL, NO page title, NO prompt content.
 */
function exportSessionsCSV(sessions) {
  const columns = [
    'id', 'sourcePlatform', 'sourceKind', 'toolName', 'rawDomain', 'rawUrlPattern',
    'startedAt', 'endedAt', 'activeSeconds', 'localDate', 'isNight',
    'confidence', 'status',
  ];
  const headers = [
    'ID', '平台', '来源', '工具', '域名', 'URL Pattern',
    '开始时间', '结束时间', '活跃秒数', '日期', '夜间',
    '置信度', '状态',
  ];

  if (!sessions || sessions.length === 0) {
    return headers.join(',') + '\n';
  }

  const rows = sessions.map(s => ({
    id: s.id || '',
    sourcePlatform: s.sourcePlatform || '',
    sourceKind: s.sourceKind || '',
    toolName: s.toolName || '',
    rawDomain: s.rawDomain || s.domain || '',
    rawUrlPattern: s.rawUrlPattern || '',
    startedAt: s.startedAt || '',
    endedAt: s.endedAt || '',
    activeSeconds: s.activeSeconds || s.duration || 0,
    localDate: s.localDate || '',
    isNight: s.isNight ? '是' : '否',
    confidence: s.confidence ?? '',
    status: s.status || '',
  }));

  return generateCSV(rows, columns, headers);
}

/**
 * Export ledger entries CSV — aligned with shared schema fields.
 */
function exportEntriesCSV(entries) {
  const columns = [
    'id', 'detectedSessionId', 'sourcePlatform', 'toolName', 'useCaseName',
    'estimatedSavedMinutes', 'promptMinutes', 'reviewMinutes', 'editMinutes',
    'debugMinutes', 'reworkMinutes', 'totalExtraCostMinutes', 'netGainMinutes',
    'quality', 'mood', 'hasRework', 'note', 'createdAt',
  ];
  const headers = [
    'ID', '会话ID', '平台', '工具', '用途',
    '估计节省(分钟)', 'Prompt(分钟)', '审核(分钟)', '修改(分钟)',
    '查错(分钟)', '返工(分钟)', '额外成本(分钟)', '净收益(分钟)',
    '质量', '感受', '有返工', '备注', '创建时间',
  ];

  if (!entries || entries.length === 0) {
    return headers.join(',') + '\n';
  }

  const rows = entries.map(e => ({
    id: e.id || '',
    detectedSessionId: e.detectedSessionId || e.sessionId || '',
    sourcePlatform: e.sourcePlatform || '',
    toolName: e.toolName || '',
    useCaseName: e.useCaseName || '',
    estimatedSavedMinutes: e.estimatedSavedMinutes ?? '',
    promptMinutes: e.promptMinutes ?? '',
    reviewMinutes: e.reviewMinutes ?? '',
    editMinutes: e.editMinutes ?? '',
    debugMinutes: e.debugMinutes ?? '',
    reworkMinutes: e.reworkMinutes ?? '',
    totalExtraCostMinutes: e.totalExtraCostMinutes ?? '',
    netGainMinutes: e.netGainMinutes ?? '',
    quality: e.quality || '',
    mood: e.mood || '',
    hasRework: e.hasRework ? '是' : '否',
    note: e.note || '',
    createdAt: e.createdAt || '',
  }));

  return generateCSV(rows, columns, headers);
}

/**
 * Trigger download. Works from popup/options page context, NOT service worker.
 * Fixed: Blob constructor options go as second argument, not inside the array.
 */
function downloadCSV(content, filename, mimeType) {
  mimeType = mimeType || 'text/csv;charset=utf-8';
  const blob = new Blob(['﻿' + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function downloadSessionsCSV(sessions, dateStr) {
  const csv = exportSessionsCSV(sessions);
  const date = dateStr || new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `murmur_detected_sessions_${date}.csv`);
}

function downloadEntriesCSV(entries, dateStr) {
  const csv = exportEntriesCSV(entries);
  const date = dateStr || new Date().toISOString().slice(0, 10);
  downloadCSV(csv, `murmur_ledger_entries_${date}.csv`);
}

function exportJSON(data) {
  return JSON.stringify(data, null, 2);
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    csvEscape, generateCSV,
    exportSessionsCSV, exportEntriesCSV,
    downloadCSV, downloadSessionsCSV, downloadEntriesCSV,
    exportJSON,
  });
}
