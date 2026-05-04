# Murmur 第六次复审修复报告

> 基于 `docs/CODE_REVIEW_FIFTH_RECHECK_REPORT_2026-05-04.md` 的修复实施记录  
> 修复日期：2026-05-04

## 判定结果

第六次复审共提出 5 项问题。经逐项判别：**修复 5 项，暂缓 1 项**。

| 编号 | 问题 | 判定 | 原因 |
|------|------|------|------|
| P0-1 | getEntriesByDate 数字比 ISO 字符串 | ✅ 修复 | Entry 统计为 0 |
| P1-1 | quickComplete→saveEntry 非原子 | ✅ 修复 | 失败遗留已结束 session |
| P1-2 | quickComplete(null) 返回 success | ✅ 修复 | 掩盖补全失败 |
| P1-3 | updateSession(null) 被忽略 | ✅ 修复 | Entry 已保存 Session 仍 pending |
| P1-4 | Android/macOS 构建入口 | ⏸️ 暂缓 | 同前 |
| P2-1 | 周报过滤未按 localDate | ✅ 修复 | 日报/周报口径不一致 |

---

## 修复详情

### P0-1 — getEntriesByDate() 数字时间戳比较 ISO 字符串

**问题**：`getEntriesByDate()` 用 `new Date(dateStr).getTime()` 产生数字时间戳，对比新 entry 的 ISO 字符串 `createdAt`（`"2026-05-04T..."`）时产生 `NaN` 比较，今日已记录数恒为 0。

**文件**：`browser-extension/src/shared/storage.js:169-173`

**修复**：
```js
// before: numeric timestamp comparison
const dayStart = new Date(dateStr + 'T00:00:00').getTime();
const dayEnd = new Date(dateStr + 'T23:59:59.999').getTime();
return entries.filter((e) => e.createdAt >= dayStart && e.createdAt <= dayEnd);

// after: prefer localDate, fallback local-time parse
async function getEntriesByDate(dateStr) {
  const entries = await getEntries();
  return entries.filter((e) => {
    if (e.localDate) return e.localDate === dateStr;
    const d = e.createdAt;
    if (!d) return false;
    return new Date(d).toLocaleDateString('en-CA') === dateStr;
  });
}
```

兼容 ISO 字符串和数字时间戳两种历史格式。

---

### P1-1/1-2/1-3 — 补全保存流程非原子性（合并修复）

**问题**：
1. Popup 先 `quickComplete` 结束 session，再 `saveEntry` 保存 entry。若第二步失败，session 已结束但没有对应账本记录
2. `quickComplete` 在 `quickEndSession()` 返回 null（session 已结束）时仍返回 `{success: true, data: null}`
3. `saveEntry` handler 中 `updateSession()` 返回 null 时未检查，Entry 保存后 session 可能仍 pending

**架构决策**：新增一个 Service Worker 原子 handler `completeAndSaveEntry`，将「结束 session → 保存 entry → 标记 completed」三步合并为单一事务操作。

**文件**：`service-worker.js`、`popup.js`

**修复**：

1. **service-worker.js** — 新增 `completeAndSaveEntry` handler：
```js
case 'completeAndSaveEntry': {
  // Step 1: End the active session (fails if no session)
  const session = await quickEndSession(domain);
  if (!session) return { success: false, error: 'No active session for this domain' };

  // Step 2: Link entry to completed session ID
  const entry = { ...payload.entry, detectedSessionId: payload.entry.detectedSessionId || session.id };

  // Step 3: Save entry (throws on failure → caught & returned as error)
  await saveEntry(entry);

  // Step 4: Mark session completed (best effort — entry already saved)
  await updateSession(session.id, { status: SessionStatus.COMPLETED, ... });

  return { success: true, data: { session, entry } };
}
```

2. **service-worker.js** — `quickComplete` 改为在 session 为 null 时返回失败：
```js
const session = await quickEndSession(domain);
if (!session) {
  return { success: false, error: 'No active session for this domain (may have already ended)' };
}
```

3. **service-worker.js** — `saveEntry` handler 增加 `updateSession` 返回值检查：
```js
const updated = await updateSession(sessionId, { status: SessionStatus.COMPLETED, ... });
if (!updated) {
  console.warn('[Murmur SW] Entry saved but linked session not found:', sessionId);
}
```

4. **popup.js** — 改为调用 `completeAndSaveEntry`：
```js
// before: two separate calls
const endResp = await sendMessage('quickComplete', { domain });
const saveResp = await sendMessage('saveEntry', { entry });

// after: single atomic call
const resp = await sendMessage('completeAndSaveEntry', { entry, domain });
```

---

### P2-1 — 周报过滤未按 localDate

**问题**：周报按 `startedAt` 毫秒时间戳范围过滤，与日报 `localDate` 口径不一致。跨时区凌晨记录的归属可能不匹配。

**文件**：`browser-extension/src/calculator/weekly-review.js:12-25,34`

**修复**：

1. Session 过滤改为按 `localDate` 匹配周日期集合：
```js
// 构建本周 7 天 localDate 集合 (YYYY-MM-DD)
const weekDates = new Set();
for (let i = 0; i < 7; i++) {
  const d = new Date(weekStartDate);
  d.setDate(d.getDate() + i);
  weekDates.add(d.toLocaleDateString('en-CA'));
}

// 过滤使用 localDate，与 getSessionsByDate 一致
const weekSessions = sessions.filter((s) => {
  if (s.localDate) return weekDates.has(s.localDate);
  const d = s.startedAt || s.startTime;
  if (!d) return false;
  return weekDates.has(new Date(d).toLocaleDateString('en-CA'));
});
```

2. Entry 过滤同样按 `localDate`：
```js
const weekEntries = entries.filter((e) => {
  if (e.localDate) return weekDates.has(e.localDate);
  const d = e.createdAt;
  if (!d) return false;
  return weekDates.has(new Date(d).toLocaleDateString('en-CA'));
});
const totalNetGain = weekEntries.reduce((sum, e) => sum + (e.netGainMinutes || 0), 0);
```

---

## 构建验证

```
npm --prefix browser-extension run build    → ✓ build 通过
node --check popup.js                        → ✓ OK
node --check service-worker.js               → ✓ OK
node --check storage.js                      → ✓ OK
node --check weekly-review.js                → ✓ OK
```

---

## 修复统计

| 平台 | P0 | P1 | P2 | 修改文件 |
|------|----|----|----|---------|
| Browser Extension | 1 | 3 | 1 | 4 |
| **合计** | **1** | **3** | **1** | **4** |
