# Murmur 第六轮修复后代码复审报告

> 复审对象：`docs/CODE_REVIEW_SIXTH_FIX_REPORT_2026-05-04.md` 所描述的第六轮修复  
> 复审日期：2026-05-04  
> 复审范围：Browser Extension、Android、macOS、shared schema 对齐点  
> 复审方式：静态逐项核对 + 浏览器扩展 build 验证 + 关键 JS 文件语法检查。未做业务代码变更。

## 总体结论

第六轮修复把上一轮最关键的统计问题修掉了：`getEntriesByDate()` 已优先使用 `entry.localDate`，保存后的 LedgerEntry 可以被今日统计按本地日期查到。`quickComplete` 在无 active session 时也已返回失败，Popup 改为调用 `completeAndSaveEntry`，周报过滤也改为按 `localDate` 口径处理。浏览器扩展 build 和关键 JS 语法检查均通过。

但“原子保存”仍没有完全成立。`completeAndSaveEntry` 当前仍先调用 `quickEndSession()`，而 `quickEndSession()` 会先写入 pending session 并移出 activeSessions；如果随后 `saveEntry()` 失败，仍会留下“已结束但无账本记录”的 session。另一方面，`quickEndSession()` 内部的 `saveSession()` 会吞掉异常，`completeAndSaveEntry` 也没有检查 `updateSession()` 返回值，因此仍可能出现 Entry 已保存但 session 未成功标记为 completed 的数据不一致。

## 已确认修复

### Browser Extension

- `getEntriesByDate()` 已改为优先使用 `entry.localDate`，并 fallback 到本地时间解析 `createdAt`：`browser-extension/src/shared/storage.js:169-178`。
- `quickComplete` 在 `quickEndSession()` 返回 null 时已返回失败，不再返回 `{ success: true, data: null }`：`browser-extension/src/background/service-worker.js:296-308`。
- Popup 保存补全已改为调用 `completeAndSaveEntry`，不再分两次调用 `quickComplete` 和 `saveEntry`：`browser-extension/src/popup/popup.js:365-378`。
- Service Worker 已新增 `completeAndSaveEntry` handler：`browser-extension/src/background/service-worker.js:500-524`。
- `saveEntry` handler 已检查 `updateSession()` 的返回值并输出 warning：`browser-extension/src/background/service-worker.js:528-544`。
- 周报 session 和 entry 过滤已改为使用本周 7 天 `localDate` 集合：`browser-extension/src/calculator/weekly-review.js:12-42`。

## P1 / 高风险问题

### P1-1 Browser：`completeAndSaveEntry` 仍不是真正原子，保存 Entry 失败后 session 已被结束

**位置**

- `browser-extension/src/background/service-worker.js:500-524`
- `browser-extension/src/background/sessionizer.js:179-193`
- `browser-extension/src/shared/storage.js:142-160`

**问题**

第六轮报告把 `completeAndSaveEntry` 描述为“结束 session → 保存 entry → 标记 completed”的单一事务操作，但当前代码顺序仍是：

```js
const session = await quickEndSession(domain);
...
await saveEntry(entry);
await updateSession(session.id, { status: SessionStatus.COMPLETED, ... });
```

而 `quickEndSession()` 内部会立即：

```js
await saveSession({ ...session });
activeSessions.delete(domain);
domainToolMap.delete(domain);
saveActiveSession(null);
```

如果 `saveEntry(entry)` 抛错，`completeAndSaveEntry` 会返回失败，但 session 已经被结束、写入 storage，并从 activeSessions 移除。这和第五轮报告指出的“先结束 session，再保存 entry，失败时留下已结束但未记录 session”仍是同一类问题，只是从 Popup 两次消息调用变成了 Service Worker 内部两步调用。

**影响**

- 用户看到保存失败后，原 active session 已经不再 active。
- 重试时 `completeAndSaveEntry` 会因为没有 active session 返回失败。
- 数据中会留下 pending/suspected 的 ended session，但没有对应 LedgerEntry。

**建议**

需要把 session finalization 拆成“准备完成”和“提交完成”两个阶段，或新增真正事务式 helper：

```js
// 伪代码
const session = getSessionForDomain(domain);
const finalized = buildEndedSession(session);
const entry = buildLinkedEntry(payload.entry, finalized.id);

await saveEntry(entry);
await saveSession({ ...finalized, status: SessionStatus.COMPLETED });
removeActiveSession(domain);
```

如果无法做到真正事务，至少在 `saveEntry` 失败时不要移除 active session，或者将失败后的 session 放回 activeSessions/active storage，保证用户可以重试。

### P1-2 Browser：`completeAndSaveEntry` 未检查 `updateSession()` 结果，仍可能 Entry 已保存但 Session 未 completed

**位置**

- `browser-extension/src/background/service-worker.js:519-522`
- `browser-extension/src/shared/storage.js:70-83`
- `browser-extension/src/shared/storage.js:54-61`

**问题**

`completeAndSaveEntry` 的 Step 4 没有检查 `updateSession()` 返回值：

```js
await updateSession(session.id, { status: SessionStatus.COMPLETED, updatedAt: new Date().toISOString() });
return { success: true, data: { session, entry } };
```

而 `updateSession()` 找不到 session 时会返回 `null`。这在理论上不应该发生，但当前 `quickEndSession()` 依赖的 `saveSession()` 会吞掉写入异常：

```js
async function saveSession(session) {
  try {
    ...
  } catch (err) {
    console.error('[Murmur Storage] Failed to save session:', err);
  }
}
```

因此如果 `saveSession()` 写入失败，`quickEndSession()` 仍会返回 session，`saveEntry()` 可能成功，`updateSession()` 找不到 session，但 `completeAndSaveEntry` 仍返回 success。

**影响**

- Entry 已保存，但 linked session 不存在或仍未 completed。
- 待补全数、今日统计、Inbox 可能与 Entry 数据不一致。
- 用户界面显示成功，但内部状态可能是半成功。

**建议**

- `saveSession()` 应像 `saveEntry()` 一样在失败时 `throw err`。
- `completeAndSaveEntry` 必须检查 `updateSession()` 返回值：

```js
const updated = await updateSession(session.id, { status: SessionStatus.COMPLETED, updatedAt: new Date().toISOString() });
if (!updated) {
  throw new Error('Entry saved but linked session could not be marked completed');
}
```

更好的做法是避免先保存 pending session 再 update，直接保存 completed session。

### P1-3 Browser：保留的 `saveEntry` handler 仍只 warning，不阻止 session 状态不一致

**位置**

- `browser-extension/src/background/service-worker.js:528-544`

**问题**

第六轮修复让 `saveEntry` handler 检查了 `updateSession()` 返回值，但只是打印 warning：

```js
if (!updated) {
  console.warn('[Murmur SW] Entry saved but linked session not found:', sessionId);
}
return { success: true };
```

如果未来其他入口、调试脚本或 Options 页调用 `saveEntry`，仍会出现 Entry 保存成功但 linked session 未 completed 的状态，且调用方收到的是 success。

**影响**

- 外部调用者无法知道 session 状态未更新。
- 数据一致性依赖调用方“只用 completeAndSaveEntry”，但 API 本身没有保证。

**建议**

如果 `saveEntry` handler 继续保留为公开消息入口，应该返回 warning 或 failure：

```js
return { success: false, error: 'Linked session not found after entry save' };
```

或者将其降级为内部 API，不再作为 runtime message action 暴露。

### P1-4 Android / macOS：仍无法做工程级构建验证

**位置**

- Android：未找到 `android/gradlew`、`gradle-wrapper.jar`、`gradle-wrapper.properties`
- macOS：未找到 `.xcodeproj`、`.xcworkspace`、`.pbxproj`、`Package.swift`

**问题**

第六轮继续只修浏览器扩展，Android/macOS 构建入口仍未补齐。

**影响**

- Android 仍无法验证 Kotlin/Compose/Room/WorkManager 编译。
- macOS 仍无法验证 Swift target、资源和权限配置。

**建议**

- Android 补齐 Gradle wrapper 后执行 `./gradlew :app:assembleDebug`。
- macOS 补齐 Xcode project/workspace 或 Swift Package 后执行构建验证。

## P2 / 质量与一致性问题

### P2-1 Browser：`completeAndSaveEntry` 返回的 `session` 仍是 pending 状态快照

**位置**

- `browser-extension/src/background/sessionizer.js:185-188`
- `browser-extension/src/background/service-worker.js:519-522`

**问题**

`quickEndSession()` 返回的 session 在 `service-worker.js` 中被返回给调用方：

```js
return { success: true, data: { session, entry } };
```

但该 `session` 对象在 `quickEndSession()` 中状态是：

```js
session.status = SessionStatus.PENDING;
```

后续 `updateSession()` 把 storage 中的 session 标记为 completed，但返回给 Popup 的 `data.session` 仍是 pending 快照。

**影响**

- 目前 Popup 没使用 `resp.data.session.status`，所以不是阻断问题。
- 后续如果 UI 根据返回值做提示或跳转，可能拿到错误状态。

**建议**

在返回前同步更新内存对象，或返回 `updatedSession`：

```js
const updated = await updateSession(...);
return { success: true, data: { session: updated, entry } };
```

## 构建与验证结果

### 已执行

```bash
npm --prefix browser-extension run build
```

结果：通过。

```text
[Murmur Build] Validating source files...
  ✓ All 20 required files present.
[Murmur Build] Validating manifest.json...
  ✓ Icon files verified (PNG, size-object format)
  ✓ Action icon files verified
  ✓ manifest.json valid
[Murmur Build] Copying to dist/...
[Murmur Build] ✓ Build complete. Output: dist/
```

```bash
node --check browser-extension/src/popup/popup.js
node --check browser-extension/src/background/service-worker.js
node --check browser-extension/src/shared/storage.js
node --check browser-extension/src/calculator/weekly-review.js
```

结果：全部通过。

```bash
rg -n "MOBILE_APP|FOREGROUND_APP|SessionStatus\\.ACTIVE|NEEDS_COMPLETION|SUSPECTED_ABANDONED|\\\"ACTIVE\\\"|\\\"SUSPECTED\\\"|\\\"COMPLETED\\\"|\\\"MERGED\\\"|status = 'ACTIVE'|status = 'SUSPECTED'|status = 'COMPLETED'|status = 'MERGED'" android/app/src/main/java browser-extension/src macos/Murmur -S
```

结果：未检出旧枚举或旧状态字符串残留。

### 未能执行

- Android：缺少 `gradlew`，当前环境也没有可用 `gradle` 命令，无法执行 `assembleDebug`。
- macOS：缺少 Xcode project/workspace 或 Swift Package，无法执行构建验证。
- 浏览器端交互：未运行真实 Chrome Popup 点击流，只完成静态链路与 JS 语法检查。

## 建议修复顺序

1. 先把 `completeAndSaveEntry` 改成真正事务式流程，避免 `quickEndSession()` 先落库 pending session 后再保存 entry。
2. 让 `saveSession()` 失败时抛错，并检查 `updateSession()` 返回值。
3. 调整 `saveEntry` message handler：linked session 更新失败时不要静默 success。
4. 返回 `updatedSession`，避免返回 pending 状态快照。
5. 补 Android/macOS 构建入口，完成三端工程级验证。

## 复审结论

第六轮已经修复了第五轮最直接的 Entry 日期统计问题，浏览器端账本闭环比上一轮更接近可用。但“原子保存”目前还只是把两次消息合并成一次 handler，内部仍存在半成功状态。下一轮应重点把 session completion 和 entry save 的状态提交顺序理顺，否则真实用户在存储失败或边界重试时仍可能产生不一致数据。
