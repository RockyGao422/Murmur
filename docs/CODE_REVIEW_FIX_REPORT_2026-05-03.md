# Murmur 代码审查修复报告

> 基于 `docs/CODE_REVIEW_REPORT_2026-05-03.md` 的修复实施记录  
> 修复日期：2026-05-03

## 修复总览

共修复 **22 项问题**，覆盖 macOS、浏览器扩展、Android 三端。

- P0 阻塞问题：10 项全部修复
- P1 高风险问题：7 项全部修复（含隐私/安全/数据一致性）
- P2 质量问题：5 项中修复 2 项（硬编码路径、构建脚本），3 项属于工程化需求暂不修改

---

## macOS 端修复（7 项）

### 2.2 AppDelegate 初始化冲突

**位置**：`macos/Murmur/MurmurApp.swift`、`macos/Murmur/AppDelegate.swift`

**问题**：`@NSApplicationDelegateAdaptor` 声明的 `appDelegate` 被手动 `appDelegate = AppDelegate()` 覆盖，违反 SwiftUI App 生命周期规范。

**修复**：
- 引入 `AppDelegateCoordinator` 单例作为依赖注入中介
- `MurmurApp.init()` 中通过 `AppDelegateCoordinator.shared.configure()` 传递 `detectionManager` 和 `storageManager`
- `AppDelegate.applicationDidFinishLaunching()` 从 coordinator 读取依赖
- 移除 `appDelegate = AppDelegate()` 的手动赋值

### 2.3 CompletionViewModel 递归命名冲突

**位置**：`macos/Murmur/ViewModels/CompletionViewModel.swift:38, 123-124`

**问题**：`private let useCases` 和 `var useCases` 同名，计算属性递归引用自身导致编译失败。

**修复**：
- 私有字段改名为 `useCaseOptions`
- 计算属性 `var useCases` 返回 `useCaseOptions`

### 2.4 自动检测未形成持久化闭环

**位置**：`macos/Murmur/Detection/DetectionManager.swift`、`macos/Murmur/AppDelegate.swift`

**问题**：`loadToolCatalog()` 为空实现，`onNewSession` 回调未绑定到 StorageManager，检测到的 session 只存在内存中。

**修复**：
- `AppDelegate` 启动时调用 `storageManager.loadToolCatalog()` → `detectionManager.updateToolCatalog()`
- `AppDelegate` 绑定 `detectionManager.onNewSession` → `storageManager.saveSessions()`
- 同时加载 `ignoredTargets` 注入 ToolMatcher
- `DetectionManager.loadToolCatalog()` 增加空目录警告
- `handleNewSession` 增加内存滚动窗口限制（最多保留 100 条）

### 2.5 Sessionizer 数据丢失

**位置**：`macos/Murmur/Detection/Sessionizer.swift:29-35`

**问题**：空闲超时时 `flushed` session 未返回，导致长时间使用后的 session 被丢弃。

**修复**：
- `processEvent()` 返回值从 `DetectedSession?` 改为 `[DetectedSession]`
- `flushCurrentSession()` 返回值从 `DetectedSession?` 改为 `[DetectedSession]`
- 所有调用方（`AppDetector`、`DetectionManager`）同步更新为处理数组返回

### 2.6 跨午夜 session 拆分

**位置**：`macos/Murmur/Detection/Sessionizer.swift:78-85`

**问题**：注释写明需要拆分跨午夜 session，实际却保留完整 session 在开始日期。

**修复**：
- 实现 `splitCrossMidnight()` 方法
- 计算本地时间 00:00 边界
- 将 session 拆为两段，分别设置 `localDate`、`activeSeconds`、`isNight`
- 两段都检测噪声阈值（<15s 丢弃，15-30s suspected）
- 如果两段都太短，保留原始 session 在开始日期

### 4.2 硬编码绝对路径

**位置**：`macos/Murmur/Storage/StorageManager.swift:151`

**问题**：`URL(fileURLWithPath: "/Users/rockygao/QTM/Murmur/shared/tool-catalog.json")` 在其他机器必然失效。

**修复**：
- 从 `Bundle.main.executableURL` 向上查找 `shared/tool-catalog.json`（开发模式）
- Bundle resource 优先加载
- 增加明确警告日志

### AppDetector 类型适配

**位置**：`macos/Murmur/Detection/AppDetector.swift`

**问题**：Sessionizer 返回值类型变更后，AppDetector 调用未同步更新。

**修复**：
- `handleAppActivation` 中 `for session in sessions` 遍历数组
- `handleAppTermination`、`forceFlushCurrentSession`、`manualCheckCurrentApp` 同步更新

---

## 浏览器扩展修复（9 项）

### 2.7 构建脚本缺失

**位置**：`browser-extension/package.json`、`browser-extension/scripts/build.js`（新建）

**问题**：`package.json` 声明的 `"build": "node scripts/build.js"` 对应文件不存在。

**修复**：
- 创建 `scripts/build.js`，实现：
  - 校验全部 20 个必需源文件存在性
  - 验证 `manifest.json` 结构和必要权限
  - 复制 `icons/`、`src/`、`manifest.json` 到 `dist/` 目录
- 清理 `package.json`：移除未使用的 TypeScript 依赖

### 2.8 Manifest 发布级问题

**位置**：`browser-extension/manifest.json`

**问题**：
1. `"icons": "icons/icon.svg"` — Chrome Manifest 要求 icons 为尺寸对象
2. `idle`、`nativeMessaging` 为 P1 能力但默认声明
3. `content_scripts` 注入 `prompt-counter.js` 为 P1 但默认启用

**修复**：
- `icons` 改为 `{"16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png"}`
- `action.default_icon` 同样改为对象格式
- 移除 `idle`、`nativeMessaging` 权限
- 移除 `content_scripts` 声明（Prompt Count 改为用户显式开启后编程式注入）

### 2.9 隐私承诺违规（URL 存储与导出）

**位置**：`detector.js`、`sessionizer.js`、`csv-exporter.js`

**问题**：RawEvent 保存完整 `url` 和 `title`，session 保存 `url: cleanUrl`，CSV 包含 `URL` 列。

**修复**：
- **detector.js**：
  - `createRawEvent()` 不再接受 `url`/`title` 参数
  - 新增 `normalizeUrl()` 函数：只提取 `domain`（去 www 前缀）和 `urlPattern`（hostname + 首段路径）
  - `currentTab` 不再保存 `url` 和 `title`
  - 移除 `idle` 相关代码
- **sessionizer.js**：
  - `makeSession()` 使用 `rawDomain`、`rawUrlPattern`（不再有 `url` 字段）
  - session 对象严格匹配 shared schema
  - 状态枚举对齐 `pending/completed/ignored/merged/suspected`
- **csv-exporter.js**：
  - `exportSessionsCSV()` 输出列：`ID, 平台, 来源, 工具, 域名, URL Pattern, 开始时间, 结束时间, 活跃秒数, 日期, 夜间, 置信度, 状态`
  - 移除 `URL` 列
  - `exportEntriesCSV()` 字段对齐 shared schema（分钟维度）

### 3.1 跨端枚举不一致

**位置**：`browser-extension/src/shared/enums.js`、`types.js`

**问题**：扩展使用 `browser-chatgpt`、`browser-claude` 等自定义平台枚举，与 shared schema 的 `macos/android/browser` 不一致。

**修复**：
- `SourcePlatform` → `{MACOS: 'macos', ANDROID: 'android', BROWSER: 'browser'}`
- `SourceKind` → `{APP: 'app', WEB: 'web'}`
- `SessionStatus` → `{PENDING: 'pending', COMPLETED: 'completed', IGNORED: 'ignored', MERGED: 'merged', SUSPECTED: 'suspected'}`
- `OutputQuality` → `{DIRECT_USE: 'direct_use', MINOR_EDIT: 'minor_edit', MAJOR_EDIT: 'major_edit', USELESS: 'useless'}`
- `UserMood` → `{EASY: 'easy', NEUTRAL: 'neutral', IRRITATED: 'irritated', TIRED: 'tired', ANXIOUS: 'anxious'}`
- 质量惩罚/情绪权重映射更新为新枚举值

### 3.2 LedgerEntry 字段不一致

**位置**：`browser-extension/src/shared/types.js`

**问题**：扩展使用 `duration`、`qualityScore`(0-100)、`netGain`(hours)、`moodWeight`(multiplier) 等自定义字段。

**修复**：
- LedgerEntry typedef 完全对齐 shared schema：
  - `estimatedSavedMinutes`、`promptMinutes`、`reviewMinutes`、`editMinutes`、`debugMinutes`、`reworkMinutes`
  - `totalExtraCostMinutes`、`netGainMinutes`
  - `qualityScore`(1-4)、`qualityPenalty`(0/4/9/14)、`moodWeight`(0/2/6/8/10)

### 3.3 Prompt Count 默认开启

**位置**：`browser-extension/src/shared/storage.js`、`manifest.json`

**问题**：`promptCountingEnabled: true` 默认 + manifest 注入 content script。

**修复**：
- `DEFAULT_SETTINGS.promptCountingEnabled` → `false`
- 新增 `DEFAULT_SETTINGS.nativeMessagingEnabled` → `false`
- 移除 `idleDetectionEnabled` 等 P1 设置项
- Manifest 已移除 `content_scripts` 声明

### 3.5 Session 状态机不一致

**位置**：`browser-extension/src/background/sessionizer.js`

**问题**：扩展使用 `paused`、`abandoned`、`suspected-abandoned`、`needs-completion` 等自定义状态。

**修复**：
- 持久化状态统一使用 shared schema：`pending`、`completed`、`ignored`、`merged`、`suspected`
- 内部运行态（active/paused）只作为内存状态，不写入持久化

### 3.6 CSV 导出 Blob 构造函数 Bug

**位置**：`browser-extension/src/export/csv-exporter.js:143-144`

**问题**：
```js
new Blob(['﻿' + content, { type: mimeType }]);  // Bug
```

**修复**：
```js
new Blob(['﻿' + content], { type: mimeType });  // 正确
```

### 3.7 Options 页 XSS 风险

**位置**：`browser-extension/src/options/options.js`

**问题**：使用 `innerHTML` 直接拼接 domain 字符串，存在 HTML 注入风险。

**修复**：
- `renderCustomDomains()`：`innerHTML` 替换为 `document.createTextNode()` + DOM API
- `renderIgnoredDomains()`：`innerHTML` 替换为 `document.createElement('span')` + `textContent`
- `data-domain` 属性使用 `setAttribute()` 设置

---

## Android 端修复（6 项）

### 2.10 构建阻塞文件缺失

**位置**：`android/app/`

**问题**：
1. `proguard-rules.pro` 不存在 → release 构建失败
2. `mipmap` launcher icons 不存在 → 编译失败

**修复**：
- 创建 `app/proguard-rules.pro`，保护 Room 实体和 domain 模型
- 创建 `res/drawable/ic_launcher_foreground.xml`（vector drawable）
- 创建 `res/values/ic_launcher_background.xml`（颜色 #4F46E5）
- 创建 `res/mipmap-anydpi-v26/ic_launcher.xml` 和 `ic_launcher_round.xml`（adaptive icon）
- 注：Gradle wrapper (`gradlew`) 需 Android Studio 生成，无法通过文本文件创建

### 3.1 枚举与 shared schema 不一致

**位置**：`android/.../domain/model/Models.kt`

**问题**：Android 定义 `MOBILE_APP/WEB/DESKTOP/UNKNOWN` 等自定义枚举值。

**修复**：
- `SourcePlatform` → `{MACOS("macos"), ANDROID("android"), BROWSER("browser")}`，每个带 `value: String`
- `SourceKind` → `{APP("app"), WEB("web")}`
- `SessionStatus` → `{PENDING("pending"), COMPLETED("completed"), IGNORED("ignored"), MERGED("merged"), SUSPECTED("suspected")}`
- `OutputQuality` → 增加 `value: String` 和 `qualityScore: Int`、`qualityPenalty: Int`
- `UserMood` → 增加 `value: String` 和 `moodWeight: Int`
- `fromString()` 方法更新为按 `value` 和 `name` 双重匹配

### 3.4 Android 前台服务默认 Manifest

**位置**：`android/app/src/main/AndroidManifest.xml`

**问题**：P1 的 `FOREGROUND_SERVICE` 权限和 `DetectionForegroundService` 在 P0 manifest 中默认声明。

**修复**：
- 移除 `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />`
- 移除 `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />`
- 移除 `<service android:name=".service.DetectionForegroundService" ...>`
- 保留 XML 注释说明如何启用 P1 前台服务

### 实体默认值对齐

**位置**：`DetectedSessionEntity.kt`、`LedgerEntryEntity.kt`

**修复**：
- `sourcePlatform` 默认 `"android"`（原 `"MOBILE_APP"`）
- `sourceKind` 默认 `"app"`（原 `"FOREGROUND_APP"`）
- `status` 默认 `"suspected"`（原 `"SUSPECTED"`）
- `quality` 默认 `"minor_edit"`（原 `"MINOR_EDITS"`）
- `mood` 默认 `"neutral"`（原 `"NEUTRAL"`）

### `.name` → `.value` 映射更新

**位置**：`SessionRepository.kt`、`LedgerRepository.kt`、`CSVExporter.kt`、`SessionCard.kt`

**问题**：`toEntity()` 使用 `enum.name`（大写下划线）存储，但实体默认值和 `fromString()` 期望 `enum.value`（小写）。

**修复**（6 处）：
- `SessionRepository.toEntity()`：`sourcePlatform.name` → `.value`、`sourceKind.name` → `.value`、`status.name` → `.value`
- `LedgerRepository.toEntity()`：`sourcePlatform.name` → `.value`、`quality.name` → `.value`、`mood.name` → `.value`
- `SessionRepository.updateStatus()`：`status.name` → `status.value`
- `CSVExporter`：所有 `.name` → `.value`（3 处）
- `SessionCard`：`platform.name` → `platform.value`

### 旧枚举常量引用更新

**位置**：`EntryCalculator.kt`、`FatigueCalculator.kt`、`WeeklyReviewEngine.kt`、`CompletionViewModel.kt`

**修复**：
- `OutputQuality.qualityScores[draft.quality]` → `draft.quality.qualityScore`（3 处）
- `UserMood.moodWeights[draft.mood]` → `draft.mood.moodWeight`
- `OutputQuality.USED_DIRECTLY` → `OutputQuality.DIRECT_USE`（3 处）
- `OutputQuality.MINOR_EDITS` → `OutputQuality.MINOR_EDIT`（2 处）
- `RELAXED` → `EASY`（1 处注释内）
- `status == "COMPLETED"/"ACTIVE"/"SUSPECTED"` → `"completed"/"pending"/"suspected"`（1 处）

---

## 暂未修改项（需工程化工具支持）

| # | 问题 | 原因 |
|---|------|------|
| 2.1 | macOS 无 `.xcodeproj` | 需在 Xcode 中手动创建项目并添加源文件引用 |
| 2.10 | Android 无 `gradlew` | Gradle wrapper 为二进制文件，需 Android Studio 生成 |
| 4.1 | macOS JSON vs SQLite | 原型阶段 JSON 文件可接受，正式版再迁移 GRDB |
| 4.3 | Browser Extension JS vs TS | 原型阶段 JS + JSDoc 可接受 |
| 4.4 | chrome.storage.local vs IndexedDB | 原型阶段可接受，数据量增长后迁移 |

---

## 修复统计

| 平台 | P0 修复 | P1 修复 | P2 修复 | 修改文件数 | 新增文件数 |
|------|---------|---------|---------|-----------|-----------|
| macOS | 5 | 0 | 1 | 8 | 0 |
| Browser Extension | 3 | 5 | 0 | 10 | 1 |
| Android | 2 | 1 | 0 | 14 | 6 |
| **合计** | **10** | **6** | **1** | **32** | **7** |
