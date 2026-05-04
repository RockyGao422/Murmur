# Murmur 第七次复审修复报告

> 基于 `docs/CODE_REVIEW_SIXTH_RECHECK_REPORT_2026-05-04.md` 的修复实施记录  
> 修复日期：2026-05-04

## 判定结果

第七次复审共提出 4 项问题。经逐项判别：**修复 3 项，暂缓 1 项**。

| 编号 | 问题 | 判定 | 原因 |
|------|------|------|------|
| P1-1 | completeAndSaveEntry 非真正原子 | ✅ 修复 | 先结束 session 再存 entry，失败留半成功 |
| P1-2 | saveSession 吞异常 + updateSession 未检查 | ✅ 修复 | 写入失败静默丢失 |
| P1-3 | saveEntry handler 只 warn 不 fail | ✅ 修复 | 调用方收到 success 但状态不一致 |
| P1-4 | Android/macOS 构建入口 | ⏸️ 暂缓 | 同前 |
| P2-1 | 返回 session 仍是 PENDING 快照 | ✅ 修复 | 附带在 P1-1 修复中 |

---

## 修复详情

### P1-1 — completeAndSaveEntry 操作顺序反转

**问题**：`completeAndSaveEntry` 先调用 `quickEndSession()`（立刻写入 storage + 移除 activeSessions），再 `saveEntry()`。若第二步失败，session 已结束但无对应账本记录，且用户无法重试（active session 已不存在）。

**修复思路**：将操作顺序颠倒为「先存 Entry → 后结束 Session」。Entry 保存失败则 Session 完整保留，用户可重试。Entry 成功后直接将会话作为 `COMPLETED` 写入（而非先写 `PENDING` 再 `updateSession` 改为 `COMPLETED`）。

**文件**：`browser-extension/src/background/service-worker.js:500-557`

**修复**：
```js
case 'completeAndSaveEntry': {
  const activeSession = getSessionForDomain(domain);
  if (!activeSession) return { success: false, error: 'No active session' };

  // Step 1: Save entry first (session untouched; failure → retry-safe)
  const entry = { ...payload.entry, detectedSessionId: ... };
  await saveEntry(entry);

  // Step 2: Entry persisted — now finalize session as COMPLETED
  const completedSession = {
    ...activeSession,
    endedAt: new Date().toISOString(),
    activeSeconds: elapsed,
    status: SessionStatus.COMPLETED,
    updatedAt: new Date().toISOString(),
  };
  await saveSession(completedSession);  // 直接写入 COMPLETED
  activeSessions.delete(domain);         // 从内存移除
  domainToolMap.delete(domain);
  saveActiveSession(null);

  // Step 3: 验证 + 返回 COMPLETED 状态 session（解决 P2-1）
  await updateSession(...);  // best-effort 确认
  return { success: true, data: { session: completedSession, entry } };
}
```

关键变化：
- **顺序反转**：Entry 先于 Session 持久化
- **状态升级**：Session 直接写为 `COMPLETED`，不再先 `PENDING` 后 `updateSession`
- **返回对象修正**：`data.session` 携带 `COMPLETED` 状态（解决 P2-1）

---

### P1-2 — saveSession 吞异常

**问题**：`saveSession()` 内部 try-catch 只打印日志不抛出。若写入 storage 失败，`quickEndSession()` 仍返回 session 对象，调用方认为成功但实际未落盘。

**文件**：`browser-extension/src/shared/storage.js:54-62`

**修复**：
```js
// before
async function saveSession(session) {
  try {
    const sessions = await getSessions();
    sessions.push(session);
    await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
  } catch (err) {
    console.error('[Murmur Storage] Failed to save session:', err);
  }
}

// after — 异常直接抛出，与 saveEntry 行为一致
async function saveSession(session) {
  const sessions = await getSessions();
  sessions.push(session);
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
}
```

---

### P1-3 — saveEntry handler 静默 success

**问题**：`saveEntry` handler 在 `updateSession()` 返回 null 时只打 warning 仍返回 `success: true`。调用方无法感知 session 状态未更新。

**文件**：`browser-extension/src/background/service-worker.js:560-575`

**修复**：
```js
// before
if (!updated) {
  console.warn('[Murmur SW] Entry saved but linked session not found:', sessionId);
}
return { success: true };

// after
if (!updated) {
  return { success: false, error: 'Entry saved but linked session could not be marked completed' };
}
return { success: true };
```

---

## 构建验证

```
npm --prefix browser-extension run build    → ✓ build 通过
node --check storage.js                      → ✓ OK
node --check service-worker.js               → ✓ OK
```

---

## 修复统计

| 平台 | P1 | P2 | 修改文件 |
|------|----|----|---------|
| Browser Extension | 3 | 1（附带） | 2 |
| **合计** | **3** | **1** | **2** |
