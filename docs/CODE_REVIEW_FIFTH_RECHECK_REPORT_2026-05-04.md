# Murmur 第五轮修复后代码复审报告

> 复审对象：`docs/CODE_REVIEW_FIFTH_FIX_REPORT_2026-05-04.md` 所描述的第五轮修复  
> 复审日期：2026-05-04  
> 复审范围：Browser Extension、Android、macOS、shared schema 对齐点  
> 复审方式：静态逐项核对 + 浏览器扩展 build 验证 + 关键 JS 文件语法检查。未做业务代码变更。

## 总体结论

第五轮修复整体方向正确，且多数问题已真实落地：Popup 不再引用未加载的 `SourcePlatform`，补全表单已增加用途与 Prompt/审核/修改/查错/返工分钟字段，`getStatus.currentSession` 已返回 `toolId/sourcePlatform/localDate/timezone` 等补全所需字段，`getSessionsByDate()` 也已优先使用 `session.localDate`。浏览器扩展 build 通过，关键 JS 文件语法检查通过。

但仍不能判定为完全可验收。当前最主要的阻断问题是 `getEntriesByDate()` 仍按数字时间戳比较 entry 的 ISO `createdAt` 字符串，导致今日 Entry 查询基本为空。也就是说，用户即使成功保存 LedgerEntry，Popup 今日统计和 `getTodayStats` 仍可能显示 `已记录 = 0`。此外，补全保存流程仍是“先结束 session，再保存 entry”，保存失败会留下已结束但未记录的 session，缺少事务式回滚或可恢复策略。

## 已确认修复

### Browser Extension

- Popup 保存 entry 时已直接使用 `'browser'`，不再引用未加载的 `SourcePlatform`：`browser-extension/src/popup/popup.js:335-339`。
- Popup 补全表单已增加用途、Prompt 时间、审核时间、修改时间、查错时间、返工时间、备注和错误提示区域：`browser-extension/src/popup/popup.html:73-132`。
- `onSaveCompletion()` 已根据用户输入计算 `totalExtraCostMinutes`、`netGainMinutes`、`qualityScore`、`qualityPenalty`、`moodWeight`、`hasRework`：`browser-extension/src/popup/popup.js:314-363`。
- `saveEntry()` 异常后已重新抛出，Service Worker 能感知失败：`browser-extension/src/shared/storage.js:142-160`。
- Popup 已检查 `quickComplete` 和 `saveEntry` 响应，并在失败时显示 `compError`：`browser-extension/src/popup/popup.js:365-383`。
- `getStatus.currentSession` 已补充 `toolId/sourcePlatform/sourceKind/rawDomain/localDate/timezone`：`browser-extension/src/background/service-worker.js:260-275`。
- `getSessionsByDate()` 已优先使用 `session.localDate`，不再强制按 UTC `startedAt.slice(0,10)` 过滤：`browser-extension/src/shared/storage.js:94-104`。
- 导出文件名、`crossesMidnight()`、`getTodaySummary()` 等多处 UTC 日期残留已改为本地日期：`browser-extension/src/export/csv-exporter.js:126-135`、`browser-extension/src/background/sessionizer.js:228-231`、`browser-extension/src/shared/storage.js:220-222`、`browser-extension/src/options/options.js:321-357`、`browser-extension/src/calculator/weekly-review.js:12-18`。
- 顶层 manifest `icons` 已补充 32px：`browser-extension/manifest.json:48-53`。

## P0 / 阻断问题

### P0-1 Browser：`getEntriesByDate()` 仍按数字时间戳比较 ISO 字符串，今日 Entry 统计会为空

**位置**

- `browser-extension/src/shared/storage.js:169-173`
- `browser-extension/src/popup/popup.js:359-362`
- `browser-extension/src/background/service-worker.js:245-249`
- `browser-extension/src/background/service-worker.js:353-357`
- `browser-extension/src/shared/types.js:80-83`
- `shared/schemas/ledger-entry.schema.json:86-89`

**问题**

第五轮修复了 session 的日期过滤，但 entry 的日期过滤仍是旧逻辑：

```js
const dayStart = new Date(dateStr + 'T00:00:00').getTime();
const dayEnd = new Date(dateStr + 'T23:59:59.999').getTime();
return entries.filter((e) => e.createdAt >= dayStart && e.createdAt <= dayEnd);
```

而新保存的 entry 使用的是 ISO 字符串：

```js
createdAt: new Date().toISOString(),
updatedAt: new Date().toISOString(),
localDate: completionSessionData.localDate || new Date().toLocaleDateString('en-CA'),
```

`types.js` 和 shared schema 也都定义 `createdAt/updatedAt` 为 ISO 8601 字符串。因此表达式 `e.createdAt >= dayStart` 会把 ISO 字符串转成 `NaN` 后比较，结果通常为 `false`。

**影响**

- 用户保存 LedgerEntry 后，Popup 今日统计 `todayEntryCount` 仍可能是 0。
- `getTodayStats` 的 `entryCount` 也会错误。
- 今日账本、日报聚合、后续基于日期查询 entry 的统计都会漏数。
- 这会让第五轮新增的补全入口看起来“保存了”，但主界面不反映结果。

**建议**

与 session 一样，entry 日期查询应优先使用 `localDate`：

```js
async function getEntriesByDate(dateStr) {
  const entries = await getEntries();
  return entries.filter((e) => {
    if (e.localDate) return e.localDate === dateStr;
    const d = e.createdAt || e.created_at;
    if (!d) return false;
    return new Date(d).toLocaleDateString('en-CA') === dateStr;
  });
}
```

如需兼容历史数字时间戳，再额外处理 `typeof d === 'number'`。

## P1 / 高风险问题

### P1-1 Browser：补全保存流程先结束 session，再保存 entry，失败时会留下已结束但未记录的 session

**位置**

- `browser-extension/src/popup/popup.js:365-383`
- `browser-extension/src/background/service-worker.js:296-305`
- `browser-extension/src/background/service-worker.js:497-510`

**问题**

当前保存流程是：

1. Popup 构建 entry；
2. 调用 `quickComplete` 结束 session；
3. 再调用 `saveEntry` 保存 entry；
4. `saveEntry` 失败时显示错误并保留表单。

代码上是：

```js
const endResp = await sendMessage('quickComplete', { domain });
...
const saveResp = await sendMessage('saveEntry', { entry });
if (!saveResp.success) {
  document.getElementById('compError').textContent = '保存失败...';
  return;
}
```

这比上一轮“静默失败”好，但仍不具备事务性。只要 `quickComplete` 成功而 `saveEntry` 失败，session 已经从 activeSessions 移除并写入 storage，用户看到表单还在，但后续重试依赖旧的 `completionSessionData`，状态恢复和计时都不再一致。

**影响**

- 可能出现已结束 session 没有对应 LedgerEntry。
- 用户重试保存时，`quickComplete` 可能返回 `{ success: true, data: null }`，流程仍继续，语义不清晰。
- 失败恢复路径对用户和数据状态都不够稳。

**建议**

把完成和保存合成一个 Service Worker 原子操作，例如 `completeAndSaveEntry`：

1. 找到 active session；
2. 结束 session；
3. 保存 entry；
4. 标记 session completed；
5. 任一步失败时返回明确错误，并保持可恢复状态。

至少应在 Popup 重试时识别 session 已结束，不再重复调用 `quickComplete`。

### P1-2 Browser：`quickComplete` 在没有 active session 时仍返回 success，可能掩盖补全失败

**位置**

- `browser-extension/src/background/service-worker.js:296-305`
- `browser-extension/src/popup/popup.js:365-375`

**问题**

`quickComplete` 只要有 domain 就返回 success，即使 `quickEndSession(domain)` 返回 `null`：

```js
const session = await quickEndSession(domain);
return {
  success: true,
  data: session,
};
```

Popup 只检查 `endResp.success`，不检查 `endResp.data` 是否存在。若 session 已被 previousDomain、auto-abandon 或其他路径结束，Popup 仍会继续保存 entry。

**影响**

- 可能创建与当前 active session 状态不一致的 entry。
- `saveEntry` handler 可能无法把对应 session 标记为 `completed`，但仍返回成功。

**建议**

`quickComplete` 应在 `quickEndSession()` 返回 null 时返回失败：

```js
if (!session) return { success: false, error: 'No active session for domain' };
```

或者提供专门的“对已结束 pending session 补全”的 handler，明确区分 active completion 和 inbox completion。

### P1-3 Browser：`saveEntry` handler 忽略 `updateSession()` 失败，可能 Entry 已保存但 Session 仍 pending

**位置**

- `browser-extension/src/background/service-worker.js:501-508`
- `browser-extension/src/shared/storage.js:70-83`

**问题**

`updateSession()` 找不到 session 时返回 `null`，但 `saveEntry` handler 没有检查：

```js
await updateSession(sessionId, { status: SessionStatus.COMPLETED, updatedAt: new Date().toISOString() });
return { success: true };
```

**影响**

- Entry 已保存，但关联 session 仍可能是 `pending/suspected`。
- 今日待处理数和已记录数会同时出现同一 session。
- Inbox/待补全列表可能继续显示已保存过的会话。

**建议**

检查返回值：

```js
const updated = await updateSession(sessionId, ...);
if (!updated) return { success: false, error: 'Linked session not found' };
```

如果为了兼容历史 entry 允许无 session，也应显式返回 warning，并在 UI 层处理。

### P1-4 Android / macOS：仍无法做工程级构建验证

**位置**

- Android：未找到 `android/gradlew`、`gradle-wrapper.jar`、`gradle-wrapper.properties`
- macOS：未找到 `.xcodeproj`、`.xcworkspace`、`.pbxproj`、`Package.swift`

**问题**

第五轮未涉及 Android/macOS 构建入口。当前仍只能对 Android/macOS 做静态审查，不能验证编译、target membership、资源拷贝和权限配置。

**影响**

- Android 第四轮引入的 `LocalLifecycleOwner`、WorkManager 调度等修改仍未经过编译验证。
- macOS 仍无法确认工程可运行。

**建议**

- Android 补齐 wrapper 后执行 `./gradlew :app:assembleDebug`。
- macOS 补齐 Xcode project/workspace 或 Swift Package 后执行构建。

## P2 / 质量与一致性问题

### P2-1 Browser：周报过滤仍按 `startedAt` 时间范围，而不是 session/entry 的 `localDate`

**位置**

- `browser-extension/src/calculator/weekly-review.js:12-25`

**问题**

第五轮只把 `weekEndStr` 改成本地日期，但周报过滤仍按 `startedAt` 的毫秒时间范围：

```js
const t = typeof s.startedAt === 'string' ? new Date(s.startedAt).getTime() : (s.startTime || 0);
return t >= weekStartTime && t < weekEndTime;
```

这不一定立刻阻断，但和本地日期口径仍不完全一致。对于跨时区和凌晨记录，日报已经使用 `localDate`，周报仍可能按时间戳边界归属。

**建议**

周报也优先按 `s.localDate` 和 `e.localDate` 过滤，和今日统计保持同一日期口径。

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
node --check browser-extension/src/background/sessionizer.js
```

结果：全部通过。

```bash
rg -n "MOBILE_APP|FOREGROUND_APP|SessionStatus\\.ACTIVE|NEEDS_COMPLETION|SUSPECTED_ABANDONED|\\\"ACTIVE\\\"|\\\"SUSPECTED\\\"|\\\"COMPLETED\\\"|\\\"MERGED\\\"|status = 'ACTIVE'|status = 'SUSPECTED'|status = 'COMPLETED'|status = 'MERGED'" android/app/src/main/java browser-extension/src macos/Murmur -S
```

结果：未检出旧枚举或旧状态字符串残留。

### 未能执行

- Android：缺少 `gradlew`，当前环境也没有可用 `gradle` 命令，无法执行 `assembleDebug`。
- macOS：缺少 Xcode project/workspace 或 Swift Package，无法执行构建验证。

## 建议修复顺序

1. 先修 `getEntriesByDate()`，优先使用 `entry.localDate`，否则今日已记录数会继续错误。
2. 将 `quickComplete + saveEntry + updateSession` 合并为一个原子 handler，或至少让 `quickComplete(null)` 和 `updateSession(null)` 返回失败。
3. 统一周报按 `localDate` 过滤，避免日报/周报日期口径不一致。
4. 补 Android/macOS 构建入口，完成三端工程级验证。

## 复审结论

第五轮已经把浏览器补全入口推进到接近可用的状态，`SourcePlatform` 崩溃和成本拆分缺失都已明显改善。但 `getEntriesByDate()` 的 ISO 字符串/数字时间戳比较会让“已记录”统计继续失真，是当前最需要先修的阻断点。完成该修复并补上保存流程的原子性后，浏览器端账本闭环才更接近可验收。
