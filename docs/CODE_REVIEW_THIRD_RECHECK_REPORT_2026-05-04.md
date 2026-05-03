# Murmur 第三轮修复后代码复审报告

> 复审对象：`docs/CODE_REVIEW_THIRD_FIX_REPORT_2026-05-03.md` 所描述的第三轮修复  
> 复审日期：2026-05-04  
> 复审范围：Browser Extension、Android、macOS、shared schemas  
> 复审方式：静态逐项核对 + 浏览器扩展构建验证。未做业务代码变更。

## 总体结论

第三轮修复报告中列出的 7 个已修复项，大部分已经真实落到源码：浏览器端 `saveEntry()` 的旧字段覆盖问题已修复，manifest 图标已改为 PNG 尺寸对象，Popup 计时器、暂停检测、Native Messaging settings gating 均有对应修复；Android 的 `moodWeights` 死代码和 Completion 平台展示也已调整。

但项目仍不能判定为“三端实现完成并可验收”。本轮复审发现浏览器自动检测链路还有两个会直接导致时长严重高估的问题：事件 `metadata` 被丢弃导致窗口失焦不会暂停，导航离开 AI 站点也不会结束旧 session。另外，浏览器端目前仍没有任何创建 LedgerEntry 的 UI 或消息入口，`saveEntry()` 虽然修好了，但账本记录不会产生。Android 端则仍有权限页不刷新、检测间隔设置不生效、构建入口缺失和账本 schema 未迁移等问题。

## 已确认修复

### Browser Extension

- `saveEntry()` 已改为兼容 `detectedSessionId` 和 legacy `sessionId`，不再只用 `sessionId === undefined` 去重：`browser-extension/src/shared/storage.js:139-148`。
- manifest 顶层 `icons` 已从字符串 SVG 改为 PNG 尺寸对象：`browser-extension/manifest.json:48-52`。
- `action.default_icon` 已改为尺寸对象：`browser-extension/manifest.json:37-44`。
- `build.js` 已拒绝 string icons 和 SVG，并校验 `16/48/128` PNG 文件：`browser-extension/scripts/build.js:76-124`。
- Popup 计时器调用前已兼容 ISO `startedAt`：`browser-extension/src/popup/popup.js:228-232`。
- 暂停检测已兼容 `rawDomain || domain`：`browser-extension/src/background/detector.js:214-220`。
- `connectNative` message handler 已读取 `settings.nativeMessagingEnabled`：`browser-extension/src/background/service-worker.js:470-479`。

### Android

- `UserMood.moodWeights` 旧浮点 map 已删除，保留说明注释：`android/app/src/main/java/com/murmur/app/domain/model/Models.kt:83-86`。
- Completion 平台展示已从 `sourcePlatform.name` 改为 `sourcePlatform.value`：`android/app/src/main/java/com/murmur/app/ui/completion/CompletionScreen.kt:98`。

## P0 / 阻断问题

### P0-1 Browser：窗口失焦事件的 metadata 被丢弃，失焦不会暂停 session

**位置**

- `browser-extension/src/background/detector.js:62-76`
- `browser-extension/src/background/detector.js:138-153`
- `browser-extension/src/background/sessionizer.js:263-268`

**问题**

`onWindowFocusChanged()` 创建事件时传入了 `{ focused: false }` 或 `{ focused: true }`：

```js
createRawEvent(EventType.WINDOW_FOCUS_CHANGED, ..., { focused: false })
```

但 `createRawEvent()` 返回对象时没有包含 `metadata` 字段：

```js
return {
  eventId,
  platform,
  eventType,
  timestamp,
  ...
  tabId,
  windowId,
};
```

于是 `sessionizer.js` 中这段判断永远拿不到值：

```js
if (rawEvent.metadata?.focused === false) {
  for (const [d] of activeSessions) pauseSession(d);
}
```

**影响**

- 用户切出 Chrome、切换到其他 App、窗口失焦时，当前 AI session 不会暂停。
- AI 使用时长会持续增长，直到其他路径结束 session。
- 这会直接污染“今日使用时长”“疲劳指数”“净收益参考”等核心数据。

**建议**

`createRawEvent()` 必须保留 `metadata`：

```js
metadata,
```

并补充最小测试：构造 `WINDOW_FOCUS_CHANGED + focused:false` 后，active session 应进入 pause/auto-abandon 路径。

### P0-2 Browser：导航离开 AI 网站时旧 session 不会被暂停或结束

**位置**

- `browser-extension/src/background/detector.js:104-120`
- `browser-extension/src/background/detector.js:157-170`
- `browser-extension/src/background/sessionizer.js:237-256`

**问题**

当用户从 `chatgpt.com` 导航到 `google.com` 或任意非 AI 站点时，`onTabUpdated()` / `onNavigationCommitted()` 只把新域名传给 `processEvent()`：

```js
const { domain, urlPattern } = normalizeUrl(url);
const rawEvent = createRawEvent(EventType.TAB_UPDATED, ..., domain, urlPattern, ...);
await processEvent(rawEvent);
```

`processEvent()` 在非 AI 域名分支只检查“新域名是否有 active session”：

```js
if (activeSessions.has(domain)) pauseSession(domain);
```

但旧的 AI session 存在于旧域名 key，例如 `chatgpt.com`，新域名是 `google.com`，所以旧 session 不会被暂停、结束或保存。

**影响**

- 用户离开 AI 网站后，旧 AI session 仍留在内存 activeSessions。
- Popup 可能显示当前不是 AI 网站，但后台仍有隐藏 active session。
- 后续统计会严重高估 AI 使用时长。
- 多个 AI/非 AI 导航后可能积累多个 stale active sessions。

**建议**

检测器需要在切换 current tab/domain 前保留 previous domain，或者 sessionizer 在新事件到来时结束/暂停“当前 active domain 中不等于新 domain 的 session”。例如：

```js
const previousDomain = currentTab.domain;
...
createRawEvent(..., domain, urlPattern, false, { previousDomain });
```

然后在 `processEvent()` 中，当 `previousDomain !== domain` 时优先 pause/end previous domain。

### P0-3 Browser：没有任何 LedgerEntry 创建入口，账本记录不会产生

**位置**

- `browser-extension/src/shared/storage.js:139-154`
- `browser-extension/src/popup/popup.html:48-55`
- `browser-extension/src/popup/popup.js:278-284`
- `browser-extension/src/background/service-worker.js:290-299`

**问题**

第三轮修复了 `saveEntry()`，但全局检索显示浏览器端没有任何调用 `saveEntry()` 的业务路径。Popup 只有“完成会话 / 暂停 / 忽略”按钮：

```html
<button id="btnComplete">完成会话</button>
```

点击完成只触发 `quickComplete`：

```js
const response = await sendMessage('quickComplete');
```

Service Worker 的 `quickComplete` 只结束 session：

```js
const session = await quickEndSession(domain);
return { success: true, data: session };
```

没有打开补全表单，也没有收集 `estimatedSavedMinutes / promptMinutes / reviewMinutes / editMinutes / debugMinutes / reworkMinutes / quality / mood`，更没有保存 LedgerEntry。

**影响**

- 浏览器扩展只能产生 DetectedSession，不能产生“AI 省力账本”的核心 LedgerEntry。
- 今日统计中的 `已记录` 会长期为 0。
- CSV Entry 导出基本为空。
- 疲劳指数、周报、净收益无法基于真实用户补全数据生成。

**建议**

至少补一条完整路径：

1. `quickComplete` 结束 session 后打开 completion view/modal/page。
2. 表单使用 `suggestedDefaults(session)` 生成默认值。
3. 用户确认后调用 `calculateEntry(draft)`。
4. 调用 `saveEntry(entry)`。
5. 将 session 状态更新为 `completed`。

### P0-4 Android / macOS：仍缺少可复现构建入口

**位置**

- Android：`android/` 下仍无 `gradlew`、`gradle-wrapper.jar`、`gradle-wrapper.properties`
- macOS：`macos/` 下仍无 `.xcodeproj`、`.xcworkspace`、`.pbxproj`、`Package.swift`

**问题**

Android 已经有 `settings.gradle.kts`、`build.gradle.kts`、`libs.versions.toml`，这是进步；但没有 Gradle wrapper，且当前环境没有可用 `gradle` 命令，仍无法执行标准构建。macOS 仍没有任何 Xcode/SwiftPM 工程入口。

**影响**

- Android Kotlin/Room/Compose 代码无法验证编译。
- macOS Swift 文件无法验证 target membership、资源拷贝、AppKit 权限配置。
- “三端完成”仍缺少工程级验收基础。

**建议**

- Android 补齐 wrapper 后提供 `./gradlew :app:assembleDebug`。
- macOS 补齐 Xcode project 或 Swift Package 后提供明确构建命令。

## P1 / 高风险问题

### P1-1 Browser：localDate 和“今日”统计使用 UTC 日期，不是用户本地日期

**位置**

- `browser-extension/src/background/sessionizer.js:47-69`
- `browser-extension/src/background/service-worker.js:245-249`
- `browser-extension/src/shared/storage.js:94-101`
- `browser-extension/src/options/options.js:323-356`

**问题**

Session 的 `localDate` 使用：

```js
new Date(startedAt).toISOString().slice(0, 10)
```

Popup 今日统计也使用：

```js
new Date().toISOString().slice(0, 10)
```

这是 UTC 日期，不是用户本地日期。项目 schema 中同时保存 `timezone`，产品文档也强调每天账本和每周复盘，日期边界应按本地时区。

**影响**

以 Asia/Shanghai 为例，凌晨 00:00 到 07:59 的使用记录会被归到前一天 UTC 日期，今日统计、周报和导出都会错位。

**建议**

统一提供 `getLocalDateString(date, timeZone)` helper，使用本地年月日而不是 ISO UTC slice。`getSessionsByDate()` 也应优先使用 session.localDate，而不是重新从 startedAt 截取 UTC 日期。

### P1-2 Android：授权 Usage Access 后权限页不会自动刷新

**位置**

- `android/app/src/main/java/com/murmur/app/ui/navigation/MurmurNavigation.kt:56-68`
- `android/app/src/main/java/com/murmur/app/ui/permission/PermissionScreen.kt:176-181`

**问题**

导航层用 `remember` 只在首次组合时检查权限：

```kotlin
val hasPermission = remember {
    hasUsageStatsPermission(context)
}
```

用户点击按钮进入系统设置授权后，返回 App 时该 remembered 值不会自动重新计算，因此仍会停留在 PermissionScreen。

**影响**

- 新用户完成授权后仍看不到主界面，除非重启 Activity 或进程。
- Android 自动检测的首次体验被卡住。

**建议**

使用 lifecycle resume 触发重新检查，或用 `mutableStateOf` + `LifecycleEventObserver` 在 `ON_RESUME` 更新：

```kotlin
hasPermission = hasUsageStatsPermission(context)
```

### P1-3 Android：检测间隔设置不会重新调度 WorkManager

**位置**

- `android/app/src/main/java/com/murmur/app/ui/settings/SettingsViewModel.kt:93-97`
- `android/app/src/main/java/com/murmur/app/MurmurApplication.kt:67-89`
- `android/app/src/main/java/com/murmur/app/MurmurApplication.kt:91-113`

**问题**

设置页修改检测间隔时只写入 DataStore：

```kotlin
settingsRepo.setDetectionIntervalMinutes(minutes)
```

`MurmurApplication.rescheduleDetectionWorker(intervalMinutes)` 已实现，但全局没有调用方。初始 worker 使用 `ExistingPeriodicWorkPolicy.KEEP`，因此用户修改间隔不会影响已经排队的 periodic work。

**影响**

- 设置页显示间隔已改变，但实际检测仍按启动时默认 15 分钟运行。
- 自动检测及时性和用户设置不一致。

**建议**

`SettingsViewModel.setDetectionInterval()` 写入设置后应调用 application 层 reschedule，或抽出 `DetectionScheduler` 统一管理 WorkManager。

### P1-4 Android：前台服务开关无实际效果

**位置**

- `android/app/src/main/java/com/murmur/app/ui/settings/SettingsViewModel.kt:99-103`
- `android/app/src/main/AndroidManifest.xml:13-18`
- `android/app/src/main/AndroidManifest.xml:40-47`
- `android/app/src/main/java/com/murmur/app/service/DetectionForegroundService.kt:18-55`

**问题**

设置页有 `foregroundServiceEnabled`，ViewModel 只保存 DataStore：

```kotlin
settingsRepo.setForegroundServiceEnabled(enabled)
```

但 manifest 中前台服务权限和 service 声明都被注释，代码中也没有 `startForegroundService()` / `stopService()` 调用。

**影响**

- 用户打开“前台服务”后不会获得更可靠的实时检测。
- 设置项成为无效开关。

**建议**

短期隐藏该开关或标记为实验/不可用；真正启用时需要补 manifest 权限、service 声明、启动/停止逻辑和 Android 14 foreground service type 合规说明。

### P1-5 Android：账本 schema 仍未迁移，Android 端不能实现真实 ROI 公式

**位置**

- `android/app/src/main/java/com/murmur/app/data/local/entity/LedgerEntryEntity.kt:21-64`
- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:176-195`
- `android/app/src/main/java/com/murmur/app/ui/completion/CompletionViewModel.kt:127-177`
- `shared/schemas/ledger-entry.schema.json:19-55`

**问题**

Android 端仍使用旧字段：

```text
session_id
time_saved_seconds
extra_cost_seconds
net_gain_seconds
input_count
output_count
```

shared schema 和技术方案要求的是分钟级成本拆分：

```text
estimated_saved_minutes
prompt_minutes
review_minutes
edit_minutes
debug_minutes
rework_minutes
total_extra_cost_minutes
net_gain_minutes
```

CompletionViewModel 仍根据 `activeSeconds + quality + mood` 估算收益，而不是让用户填写 Prompt/审核/修改/查错/返工分钟。

**影响**

- Android 端与浏览器端 schema 不一致。
- Android 端“净收益”不是产品定义的真实 ROI，而是启发式估算。
- CSV、周报和跨端数据对齐会继续分叉。

**建议**

单独做一次 Android LedgerEntry migration，覆盖 Entity、DAO、Domain、Repository、Completion UI、CSV、FatigueCalculator。

### P1-6 Browser：Prompt Count 文件存在但没有注入闭环

**位置**

- `browser-extension/manifest.json:7-35`
- `browser-extension/src/content/prompt-counter.js:514-529`
- `browser-extension/src/background/service-worker.js:491-518`

**问题**

`prompt-counter.js` 和 `reportPrompt` handler 已存在，但 manifest 没有 `content_scripts`，也没有 `scripting` 权限或 `chrome.scripting.executeScript()` 动态注入路径。

**影响**

- `promptCount` 仍不会真实产生。
- “多轮 prompt / 高频使用”相关洞察不能依赖该字段。

**建议**

继续按第三轮报告暂缓即可，但产品说明和技术方案里应明确 MVP 不提供 prompt 轮数自动统计。

## P2 / 质量与一致性问题

### P2-1 Browser：`updateSession()` 会把 ISO `updatedAt` 覆盖成 epoch number

**位置**

- `browser-extension/src/shared/storage.js:70-80`
- `browser-extension/src/background/sessionizer.js:216-223`

**问题**

`checkAndMergeAdjacent()` 传入 ISO 字符串：

```js
updatedAt: lastSession.updatedAt
```

但 `updateSession()` 又强制覆盖：

```js
updatedAt: Date.now()
```

这与 `types.js` 和 shared schema 中 `updatedAt` 为 ISO 8601 字符串的约定不一致。

**影响**

- 合并后的 session 时间字段类型不一致。
- CSV/JSON 导出和后续日期处理需要额外兼容。

**建议**

统一使用：

```js
updatedAt: new Date().toISOString()
```

### P2-2 Browser：`action.default_icon` 的 32 尺寸复用了 16px 图片

**位置**

- `browser-extension/manifest.json:39-43`

**问题**

当前配置：

```json
"32": "icons/icon16.png"
```

虽然不一定阻断加载，但 32px 场景会使用 16px 图标放大。

**影响**

- 工具栏或高分屏显示可能模糊。

**建议**

补真实 `icon32.png`，并把 build 校验扩展到 action icon 的实际尺寸。

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
rg -n "MOBILE_APP|FOREGROUND_APP|SessionStatus\\.ACTIVE|NEEDS_COMPLETION|SUSPECTED_ABANDONED|\\\"ACTIVE\\\"|\\\"SUSPECTED\\\"|\\\"COMPLETED\\\"|\\\"MERGED\\\"|status = 'ACTIVE'|status = 'SUSPECTED'|status = 'COMPLETED'|status = 'MERGED'" android/app/src/main/java browser-extension/src macos/Murmur -S
```

结果：未检出旧枚举或旧状态字符串残留。

### 未能执行

- Android：缺少 `gradlew`，当前环境也没有 `gradle` 命令，无法执行 `assembleDebug`。
- macOS：缺少 Xcode project/workspace 或 Swift Package，无法执行构建验证。

## 建议修复顺序

1. 先修浏览器自动检测时长高估：补 `metadata`，并处理 previous domain 离开/切换时的 pause/end。
2. 补浏览器 LedgerEntry completion 流程，否则扩展端没有“省力账本”核心记录。
3. 补 Android 权限页 resume 刷新、检测间隔 reschedule、无效前台服务开关处理。
4. 补 Android/macOS 可复现构建入口。
5. 单独做 Android LedgerEntry schema migration。
6. 再决定是否开启 Prompt Count P1。

## 复审结论

第三轮修复解决了上一份报告中的多个明确 bug，尤其是 `saveEntry()` 覆盖问题和 manifest 图标发布风险已经明显改善。但当前浏览器自动检测仍会在常见场景下高估时长，浏览器账本记录链路也没有闭环；Android 端自动检测设置和权限流仍有运行时体验问题。项目可以继续作为原型推进，但还不能作为“三端功能完成”的验收版本。
