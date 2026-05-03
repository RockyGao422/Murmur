# Murmur 二次修复后代码复审报告

> 复审对象：`docs/CODE_REVIEW_RECHECK_FIX_REPORT_2026-05-03.md` 所描述的修复结果  
> 复审日期：2026-05-03  
> 复审范围：Browser Extension、Android、macOS 源码与构建入口  
> 复审原则：对照产品功能文档、技术方案与上次代码审查问题，重点检查自动检测、数据结构一致性、导出一致性、三端可构建性和发布风险。

## 总体结论

这轮修复确实解决了一批关键问题：Android 旧枚举引用和 DAO 状态大小写问题已经清理，浏览器端 AI 工具匹配链路、Options CSV 导出、计算器模型、Native Messaging 启动 gating 有明显改善，macOS Sessionizer 的工具切换拆分和跨午夜夜间标记也已修复。

但是，项目仍不建议进入可发布状态。当前仍存在 3 类高风险：

1. 浏览器扩展存在真实数据覆盖风险，LedgerEntry 保存逻辑仍按旧字段 `sessionId` 去重，而新模型已经迁移到 `detectedSessionId`。
2. 浏览器扩展 manifest 图标字段仍不符合 Chrome 官方推荐/要求，项目 build 通过不等于 Chrome 扩展加载、商店提交一定通过。
3. Android 和 macOS 仍缺少可复现构建入口，且 Android LedgerEntry 仍未迁移到产品技术方案定义的分钟级账本 schema。

因此，本次修复状态可以视为“核心逻辑继续推进、部分 P0 已消除”，但不是“三端实现完成并可验收”。

## 已确认修复项

### Android

- 旧枚举引用已清理。未再检出 `MOBILE_APP`、`FOREGROUND_APP`、`SessionStatus.ACTIVE`、`NEEDS_COMPLETION`、`SUSPECTED_ABANDONED` 等旧值。
- `DetectedSessionDao` 查询状态已改为小写 `pending/suspected/completed/merged`，与实体默认值和 `SessionStatus.value` 一致。
- `LedgerRepository`、`SessionRepository` 已改为使用枚举 `.value`，减少裸字符串状态漂移。
- `EntryCalculator` 已移除旧的乘法爆炸公式，不再将 `qualityScore * moodWeight` 直接作为时间乘数。

### Browser Extension

- `tool-matcher.js` 不再强依赖 `rawEvent.url`，豆包、DeepSeek 等只基于 domain/urlPattern 的自动识别链路恢复。
- Options 页导出逻辑已改为复用 `csv-exporter.js`，不再额外输出 URL 字段。
- `entry-calculator.js`、`fatigue-calculator.js`、`weekly-review.js` 已向分钟级字段和新 session 字段迁移。
- Service Worker 启动时的 `tryConnectNativeMessaging()` 已先读取 `settings.nativeMessagingEnabled`，默认关闭场景下不会主动连接 Native Host。
- 浏览器扩展本地 build 通过：`npm --prefix browser-extension run build`。

### macOS

- AI 工具切换时，`Sessionizer.swift` 已按 `toolId` 拆分 session，避免 ChatGPT -> Claude 等连续切换被合并为同一工具。
- 跨午夜 session 第一段夜间标记已移除 `|| true`，改为实际判断午夜前一秒是否处于夜间时段。

## P0 / 阻断问题

### P0-1 Browser：LedgerEntry 保存仍使用旧字段，可能覆盖所有新记录

**位置**

- `browser-extension/src/shared/storage.js:139-149`
- `browser-extension/src/shared/types.js:57-60`

**问题**

`LedgerEntry` 类型定义已经使用新字段：

```js
detectedSessionId
```

但 `saveEntry()` 仍然按旧字段去重：

```js
const existingIdx = entries.findIndex((e) => e.sessionId === entry.sessionId);
```

对于新模型生成的 entry，`entry.sessionId` 通常是 `undefined`。当第一条 entry 写入后，后续所有同样没有 `sessionId` 的 entry 都会匹配到第一条记录，并执行覆盖：

```js
entries[existingIdx] = entry;
```

**影响**

- 用户每天只能可靠保留第一条或少数错误覆盖后的记录。
- 今日账本、周报、CSV 导出、疲劳指数都会基于缺失数据计算。
- 这是静默数据丢失，用户很难察觉。

**建议**

`saveEntry()` 应改为按 `detectedSessionId` 去重，并兼容历史数据：

```js
const existingIdx = entries.findIndex((e) =>
  (e.detectedSessionId && e.detectedSessionId === entry.detectedSessionId) ||
  (e.sessionId && e.sessionId === entry.sessionId)
);
```

同时建议补一个最小单元测试：连续保存 2 条不同 `detectedSessionId` 的 entry，最终 entries 长度必须为 2。

### P0-2 Browser：manifest 图标字段仍不符合 Chrome 官方图标规范

**位置**

- `browser-extension/manifest.json:37-43`
- `browser-extension/scripts/build.js:76-88`

**问题**

当前 manifest 写法为：

```json
"action": {
  "default_icon": "icons/icon.svg"
},
"icons": "icons/icon.svg"
```

但 Chrome 官方 manifest icons 文档给出的结构是按尺寸声明的对象，例如：

```json
"icons": {
  "16": "icon16.png",
  "48": "icon48.png",
  "128": "icon128.png"
}
```

官方文档还明确提示 WebP 和 SVG 不受支持，图标通常应使用 PNG 或 Blink 支持的 raster 格式。

参考来源：Chrome 官方文档《Manifest - Icons》  
https://developer.chrome.com/docs/extensions/reference/manifest/icons

当前 `scripts/build.js` 只检查 icon 文件是否存在，并且主动允许 `manifest.icons` 是 string：

```js
const iconPaths = typeof manifest.icons === 'string' ? [manifest.icons] : Object.values(manifest.icons);
```

这会导致项目 build 通过，但 Chrome 扩展加载、Chrome Web Store 校验或后续兼容性仍可能失败。

**影响**

- 浏览器扩展发布阻断。
- 本地 build 结果给出误导性成功。
- `action.default_icon` 与顶层 `icons` 都可能需要尺寸对象。

**建议**

- 生成真实 PNG 图标：`icons/icon16.png`、`icons/icon32.png`、`icons/icon48.png`、`icons/icon128.png`。
- manifest 改为尺寸对象：

```json
"action": {
  "default_icon": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
},
"icons": {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

- `build.js` 不应再接受 string icons，也应拒绝 `.svg`。

### P0-3 Android / macOS：仍缺少可复现构建入口

**位置**

- `android/` 下未找到 `gradlew`
- `macos/` 下未找到 `.xcodeproj`、`.xcworkspace`、`Package.swift` 或 `.pbxproj`

**问题**

修复报告中将这两项标记为“需 IDE 工具生成”，但从工程验收角度看，三端实现不能只交付源码片段。当前 Android 和 macOS 仍无法通过仓库内命令完成构建验证。

**影响**

- 无法确认 Android Kotlin/Room/Compose 代码是否真实编译通过。
- 无法确认 macOS Swift 文件是否被工程 target 正确纳入。
- CI、交接、复现、回归测试都缺少最基本入口。

**建议**

- Android 至少补齐 Gradle wrapper、`settings.gradle(.kts)`、根 `build.gradle(.kts)`、app module 构建文件，并提供 `./gradlew :app:assembleDebug`。
- macOS 至少补齐 Xcode project/workspace 或 Swift Package，并确保当前 Swift 文件被 target 引用。
- 将构建命令写入 README 或技术方案验收章节。

## P1 / 高风险问题

### P1-1 Browser：Popup 当前会话计时器在新字段下会显示异常

**位置**

- `browser-extension/src/background/service-worker.js:260-268`
- `browser-extension/src/popup/popup.js:130-135`
- `browser-extension/src/popup/popup.js:229`

**问题**

Service Worker 返回给 Popup 的 `currentSession.startTime` 优先使用：

```js
session.startedAt || session.startTime
```

新模型下 `startedAt` 是 ISO 字符串。但 Popup 的 `startTimer()` 注释和实现都假设它是 epoch ms：

```js
const elapsed = Math.floor((Date.now() - startTime) / 1000);
```

当 `startTime` 是 `"2026-05-03T..."` 这类字符串时，`Date.now() - startTime` 会得到 `NaN`。

**影响**

- Popup 当前会话计时可能显示 `NaN` 或异常持续时间。
- 用户对“正在检测”和“已记录多久”的信任会下降。

**建议**

Service Worker 输出给 UI 的字段保持稳定，例如：

```js
startTime: new Date(session.startedAt || session.startTime).getTime()
```

或者 Popup 侧统一 normalize：

```js
const startMs = typeof startTime === 'string' ? new Date(startTime).getTime() : startTime;
```

### P1-2 Browser：暂停检测没有正确暂停新模型 session

**位置**

- `browser-extension/src/background/detector.js:214-219`

**问题**

`pauseDetection()` 遍历 active sessions 后调用：

```js
pauseSession(session.domain);
```

但新 session 字段已经迁移为 `rawDomain`，`domain` 在新 session 上可能不存在。

**影响**

- 用户点击“暂停 1 小时”后，检测入口停止了，但已存在的 active session 可能没有被正确 pause。
- 之后恢复或结算时，session 状态和 activeSeconds 可能不准确。

**建议**

兼容新旧字段：

```js
pauseSession(session.rawDomain || session.domain);
```

并补充一条测试：active session 只有 `rawDomain` 时，暂停后状态必须从 `pending` 变为 `paused` 或符合当前暂停模型的目标状态。

### P1-3 Browser：手动 connectNative 仍绕过 settings

**位置**

- `browser-extension/src/background/service-worker.js:470-473`
- `browser-extension/src/background/native-messaging.js:30-32`

**问题**

启动时 Native Messaging 已加 settings gating，但 message handler 里的 `connectNative` 仍直接调用：

```js
nativeMessaging.connect();
```

这条路径没有读取 `settings.nativeMessagingEnabled`。同时当前 manifest 已移除 Native Messaging 权限，默认关闭时仍可能被 Options 或调试入口触发。

**影响**

- 与“默认关闭 Native Messaging”的产品策略不一致。
- 用户未启用实验能力时仍可能触发连接尝试和错误日志。
- 后续如果重新加入权限，隐私承诺与实际行为容易出现偏差。

**建议**

`connectNative` handler 也应读取 settings：

```js
const settings = await getSettings();
if (!settings.nativeMessagingEnabled) {
  return { success: false, error: 'Native messaging disabled' };
}
```

### P1-4 Android：账本 schema 仍未按技术方案迁移，核心 ROI 公式无法严格实现

**位置**

- `android/app/src/main/java/com/murmur/app/data/local/entity/LedgerEntryEntity.kt:21`
- `android/app/src/main/java/com/murmur/app/data/local/entity/LedgerEntryEntity.kt:48-55`
- `android/app/src/main/java/com/murmur/app/export/CSVExporter.kt:49-66`
- `android/app/src/main/java/com/murmur/app/domain/calculator/EntryCalculator.kt:15-40`

**问题**

Android 账本仍使用：

```kotlin
session_id
time_saved_seconds
extra_cost_seconds
net_gain_seconds
```

但产品和技术方案定义的账本应围绕手动补全后的分钟级字段：

```text
detected_session_id
estimated_saved_minutes
prompt_minutes
review_minutes
edit_minutes
debug_minutes
rework_minutes
total_extra_cost_minutes
net_gain_minutes
```

当前 `EntryCalculator` 虽然不再爆炸，但仍根据 `activeSeconds + quality + mood` 自动估算时间收益。它没有实现 PRD 中最核心的公式：

```text
AI 净收益 = 估计节省时间 - Prompt 时间 - 审核时间 - 修改时间 - 查错时间 - 返工时间
```

**影响**

- Android 与 Browser/Mac/shared schema 不一致。
- CSV 导出字段也仍是秒级旧模型，无法和浏览器端、技术方案、Figma 补全流程统一。
- 用户在 Android 端看到的净收益不是“自己记录的真实成本”，而是启发式估算值。

**建议**

单独做一次 Android LedgerEntry schema migration：

- Entity、Domain Model、DAO、Repository、Completion UI、CSVExporter 全部切换到分钟级字段。
- `EntryCalculator` 只负责求和和边界校验，不再根据 mood/quality 推导时间。
- mood/quality 继续进入 fatigue calculator，而不是直接变成时间收益。

### P1-5 Browser：Prompt Count 功能仍无启用闭环

**位置**

- `browser-extension/manifest.json`
- `browser-extension/src/shared/types.js:50-51`
- `docs/CODE_REVIEW_RECHECK_FIX_REPORT_2026-05-03.md:187-195`

**问题**

修复报告已说明 `Prompt Count` 暂不修改。当前 manifest 没有 `content_scripts`，也没有 `scripting` optional permission 或注入路径，`promptCount` 只能停留在类型字段。

**影响**

- 自动检测只能可靠识别“用户使用了 AI 网站/软件多久”，不能识别“用了几轮 prompt”。
- 周报中的多轮修改、高频 prompt 等洞察不能依赖真实 prompt 计数。

**建议**

短期在产品说明里明确：浏览器 MVP 不承诺 prompt 轮数自动统计。  
后续若启用，应加 optional permission + content script，并针对 ChatGPT、Claude、DeepSeek、豆包分别做 DOM 适配和隐私提示。

## P2 / 质量与一致性问题

### P2-1 Android：仍有旧的 moodWeights 概念残留

**位置**

- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:83-90`

**问题**

`UserMood` 已经通过 `moodWeight` 表达疲劳权重，但 companion object 中仍保留旧的 `moodWeights` 浮点效率映射：

```kotlin
EASY to 1.2f
NEUTRAL to 1.0f
IRRITATED to 0.8f
TIRED to 0.7f
ANXIOUS to 0.6f
```

这与新模型“情绪权重进入疲劳，不直接作为时间收益乘数”的方向容易冲突。

**影响**

- 目前未观察到直接编译风险，但会误导后续开发继续把心情当成时间效率乘数。

**建议**

若无调用方，应删除该 map；如果仍需保留，应改名并注释为 legacy/deprecated。

### P2-2 Android：Completion UI 仍展示 enum name 而非产品文案

**位置**

- `android/app/src/main/java/com/murmur/app/ui/completion/CompletionScreen.kt:98`

**问题**

平台展示使用：

```kotlin
session.sourcePlatform.name
```

这会显示 `ANDROID`，而不是 `Android`、`安卓端` 或更符合产品文案的 label/value。

**影响**

- 不影响核心功能，但 UI 与 Figma/产品说明的自然语言表达不一致。

**建议**

使用 `sourcePlatform.value` 或增加 `label` 字段。

## 自动检测能力复核

### 浏览器扩展

当前浏览器端的自动检测策略主要是：

- 通过 `tabs`、`webNavigation`、host permissions 获取当前 tab 域名和导航事件。
- 通过 `tool-matcher.js` 的内置工具目录匹配 AI 站点域名。
- 已包含 DeepSeek 与豆包相关域名：
  - `*://*.deepseek.com/*`
  - `*://chat.deepseek.com/*`
  - `*://*.doubao.com/*`

这条链路在本轮修复后基本恢复。需要注意的是，它检测的是“用户处于 AI 网站/AI 工具域名中”，不是读取用户 prompt 内容。

### Android

Android 端设计依赖 `UsageStatsManager` 或 Accessibility 辅助能力识别前台 App。当前静态代码中旧枚举问题已修复，但由于没有 Gradle wrapper，尚不能确认整体可编译和权限配置完整性。

### macOS

macOS 端设计依赖前台应用/窗口信息与 AI 工具匹配规则。Sessionizer 的连续工具切换问题已修复，但由于没有 Xcode project 或 Swift Package，尚不能确认 AppKit/Accessibility/Event Tap 等实际 target 集成是否完整。

## 构建与验证结果

### 已执行

```bash
rg -n "MOBILE_APP|FOREGROUND_APP|SessionStatus\\.ACTIVE|NEEDS_COMPLETION|SUSPECTED_ABANDONED|\\\"ACTIVE\\\"|\\\"SUSPECTED\\\"|\\\"COMPLETED\\\"|\\\"MERGED\\\"|status = 'ACTIVE'|status = 'SUSPECTED'|status = 'COMPLETED'|status = 'MERGED'" android/app/src/main/java browser-extension/src macos/Murmur -S
```

结果：未检出旧枚举或旧状态字符串残留。

```bash
npm --prefix browser-extension run build
```

结果：通过。

### 未能执行

- Android：仓库中未发现 `android/gradlew`，无法执行标准 Android 构建。
- macOS：仓库中未发现 `.xcodeproj`、`.xcworkspace`、`.pbxproj` 或 `Package.swift`，无法执行标准 macOS 构建。

## 建议修复顺序

1. 先修 `storage.saveEntry()` 的 `detectedSessionId` 去重问题，避免用户账本数据继续被覆盖。
2. 修 manifest 图标结构，生成 PNG 尺寸图标，并让 `build.js` 拒绝 string icons 和 SVG。
3. 补齐 Android/macOS 可复现构建入口，否则后续所有静态审查都无法替代编译验证。
4. 修浏览器 Popup ISO 时间兼容、暂停检测 `rawDomain` 兼容、`connectNative` settings gating。
5. 单独安排 Android LedgerEntry schema migration，把 Android 账本统一到分钟级 PRD 模型。

## 复审结论

本次修复比上一轮明显前进，尤其是浏览器检测链路和 Android 状态枚举问题已经不再是主要阻塞。但当前仍有数据覆盖、扩展发布格式、三端构建入口和 Android 账本 schema 四个关键问题。

如果目标是 Demo，可继续用当前代码演示浏览器自动检测和部分统计能力；如果目标是“完成三端实现并进入验收”，仍需要完成上述 P0/P1 修复后再做一次构建级复审。
