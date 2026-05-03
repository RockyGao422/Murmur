# Murmur 三端实现代码审查报告

审查日期：2026-05-03  
审查范围：产品功能文档、技术实现方案、Figma 自动检测版原型、macOS / Android / Browser Extension 三端代码。  
审查方式：只读审查，未做代码修改。

## 1. 总体结论

当前实现不能判定为“三端完成”。更准确地说，仓库已经具备 macOS、Android、浏览器扩展三端的代码骨架和部分业务实现，但存在多处 P0 阻塞：

- macOS、Android、浏览器扩展均存在构建或发布阻塞。
- 自动检测到待补全账本的核心闭环尚未完全打通。
- 浏览器扩展存在明显的隐私承诺违约风险，尤其是 URL 存储和导出。
- 三端数据模型与 shared schema 不一致，后续统计、导出、周报和跨端聚合会失真。
- P0 / P1 范围混入，多个 P1 能力被默认启用，增加审核、隐私和用户信任成本。

因此，当前版本更适合作为“原型实现雏形”，不建议进入测试分发或继续叠加新功能。下一阶段应优先修复构建、数据模型、隐私边界和自动检测闭环。

## 2. P0 阻塞问题

### 2.1 macOS 端没有可构建工程

位置：

- `macos/`

问题：

`macos` 目录下没有 `.xcodeproj`、`.xcworkspace` 或 `Package.swift`。当前只有 Swift 源文件目录，无法作为完整 macOS App 构建、运行或归档。

影响：

- 无法执行 `xcodebuild`。
- 无法验证 Swift 编译错误。
- 无法打包、分发或接入 CI。
- 与 PRD / Figma 中“macOS 主仪表盘 + 自动检测主端”的定位不符。

建议：

- 补齐 Xcode 工程或 Swift Package 工程。
- 将 `shared/tool-catalog.json` 作为 bundle resource 正式打包。
- 建立最小构建命令和 CI 校验。

### 2.2 macOS App 入口存在编译和生命周期风险

位置：

- `macos/Murmur/MurmurApp.swift:14`
- `macos/Murmur/MurmurApp.swift:36`
- `macos/Murmur/MurmurApp.swift:37`
- `macos/Murmur/MurmurApp.swift:38`

问题：

代码使用 `@NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate` 后，又在 `init` 中执行：

```swift
appDelegate = AppDelegate()
appDelegate.detectionManager = detection
```

这不是 SwiftUI App 生命周期下的正常用法，极可能导致编译失败，或者导致 `AppDelegate` 不是系统实际注册的 delegate。

影响：

- `NSWorkspace` 前台 App 监听可能不会被正确注册。
- macOS 自动检测入口可能不会生效。
- 即使 UI 启动，检测事件也可能无法进入 `DetectionManager`。

建议：

- 不要手动重新赋值 `@NSApplicationDelegateAdaptor`。
- 通过 app delegate 的可注入属性、共享 coordinator，或在 `App` 初始化后明确绑定 detection manager。
- 增加启动时检测状态验证。

### 2.3 macOS CompletionViewModel 存在命名冲突 / 递归错误

位置：

- `macos/Murmur/ViewModels/CompletionViewModel.swift:38`
- `macos/Murmur/ViewModels/CompletionViewModel.swift:123`
- `macos/Murmur/ViewModels/CompletionViewModel.swift:124`

问题：

同一个类型中同时声明：

```swift
private let useCases: [(id: String, name: String)]

var useCases: [(id: String, name: String)] {
    return useCases
}
```

这会造成命名冲突，或在计算属性中递归引用自身。

影响：

- macOS 端很可能无法编译。
- 补全页无法正常展示用途选项。

建议：

- 将私有字段改名为 `availableUseCases` 或 `useCaseOptions`。
- 计算属性返回私有字段。

### 2.4 macOS 自动检测没有形成持久化闭环

位置：

- `macos/Murmur/Detection/DetectionManager.swift:34`
- `macos/Murmur/Detection/DetectionManager.swift:37`
- `macos/Murmur/Detection/DetectionManager.swift:106`
- `macos/Murmur/Detection/DetectionManager.swift:110`
- `macos/Murmur/Detection/DetectionManager.swift:113`
- `macos/Murmur/Detection/DetectionManager.swift:114`

问题：

`startDetection()` 调用了空实现 `loadToolCatalog()`。虽然 `DetectionManager` 提供了 `updateToolCatalog(_:)`，但当前入口没有看到稳定地从 `StorageManager.loadToolCatalog()` 加载工具目录并注入 `ToolMatcher`。

此外，`handleNewSession` 只把 session append 到内存中的 `detectedSessions`，依赖外部 `onNewSession` 回调保存，但 App 入口没有看到将该回调绑定到 `StorageManager.saveSessions`。

影响：

- 工具目录为空时，豆包、DeepSeek、ChatGPT、Claude 等 AI App 无法匹配。
- 自动检测即使生成 session，也可能只存在内存中，重启后丢失。
- Figma 中“自动检测会话 → 待补全 → Ledger Entry”的核心链路不成立。

建议：

- App 启动时加载工具目录并注入 `DetectionManager.updateToolCatalog`。
- 绑定 `DetectionManager.onNewSession` 到持久化层。
- 检测结果应先进入 `detected_sessions`，状态为 `pending` 或 `suspected`。
- 待补全页应直接消费持久化数据，而不是内存数组。

### 2.5 macOS Sessionizer 存在数据丢失

位置：

- `macos/Murmur/Detection/Sessionizer.swift:29`
- `macos/Murmur/Detection/Sessionizer.swift:32`
- `macos/Murmur/Detection/Sessionizer.swift:33`
- `macos/Murmur/Detection/Sessionizer.swift:34`

问题：

当相邻事件间隔超过 5 分钟时：

```swift
let flushed = flushCurrentSession(at: lastTime)
isInAISession = false
currentSession = nil
```

`flushed` 没有被返回，也没有通过回调保存。

影响：

- 用户长时间使用 AI 后发生空闲或切换，当前会话可能被直接丢弃。
- 今日检测次数、使用时长、待补全会话都会少算。

建议：

- 超过 idle threshold 时，应返回或保存 flushed session。
- 如需同时处理新事件，应设计为返回 `[DetectedSession]`，而不是单个 optional session。

### 2.6 macOS 跨午夜逻辑未实现

位置：

- `macos/Murmur/Detection/Sessionizer.swift:78`
- `macos/Murmur/Detection/Sessionizer.swift:81`
- `macos/Murmur/Detection/Sessionizer.swift:83`
- `macos/Murmur/Detection/Sessionizer.swift:84`

问题：

注释写明跨午夜需要拆分，但实际实现是：

```swift
// Actually, for simplicity, we just keep the full session on the start date
session.localDate = startDate
```

影响：

- 日报、周报、疲劳指数和夜间使用统计会错误。
- 与技术方案中的跨日 session 拆分验收要求不一致。

建议：

- 将跨午夜 session 拆成两段。
- 每段分别计算 `active_seconds`、`local_date`、`is_night`。

### 2.7 浏览器扩展构建脚本不存在

位置：

- `browser-extension/package.json:6`
- `browser-extension/package.json:9`

问题：

`package.json` 声明：

```json
"build": "node scripts/build.js"
```

但 `browser-extension/scripts/build.js` 不存在。

验证结果：

执行：

```bash
npm --prefix browser-extension run build
```

结果：

```text
Error: Cannot find module '/Users/rockygao/QTM/Murmur/browser-extension/scripts/build.js'
```

影响：

- 浏览器扩展无法执行声明的构建流程。
- 无法产出可加载 / 可发布目录。
- 无法进入 CI。

建议：

- 补齐 build script，或移除无效 script，改为明确的 copy / validate / package 流程。
- 至少校验 manifest、静态资源、图标、service worker 依赖和 content scripts。

### 2.8 浏览器扩展 Manifest 存在发布级问题

位置：

- `browser-extension/manifest.json:7`
- `browser-extension/manifest.json:12`
- `browser-extension/manifest.json:13`
- `browser-extension/manifest.json:45`
- `browser-extension/manifest.json:46`

问题：

`icons` 当前为：

```json
"icons": "icons/icon.svg"
```

Chrome Manifest 中 `icons` 应为按尺寸声明的对象。

此外，P1 能力被默认放进 P0 manifest：

- `idle`
- `nativeMessaging`
- `content_scripts` 注入 `prompt-counter.js`

影响：

- manifest 可能无法通过浏览器加载或商店校验。
- 默认权限过宽，降低用户信任。
- 与技术方案中“Native Messaging / idle / Prompt Count 为 P1”的范围不一致。

建议：

- 将 `icons` 改为尺寸对象，并补齐 png 图标资源。
- P0 manifest 只申请必要权限。
- P1 能力使用单独版本、可选权限或高级开关。

### 2.9 浏览器扩展违反“不保存 / 不导出完整敏感 URL”的隐私承诺

位置：

- `browser-extension/src/background/detector.js:72`
- `browser-extension/src/background/detector.js:79`
- `browser-extension/src/background/detector.js:81`
- `browser-extension/src/background/sessionizer.js:89`
- `browser-extension/src/background/sessionizer.js:94`
- `browser-extension/src/export/csv-exporter.js:47`
- `browser-extension/src/export/csv-exporter.js:49`
- `browser-extension/src/export/csv-exporter.js:52`
- `browser-extension/src/export/csv-exporter.js:68`
- `browser-extension/src/options/options.js:307`
- `browser-extension/src/options/options.js:309`
- `browser-extension/src/options/options.js:316`

问题：

浏览器扩展保存 raw event 的 `url` 和 `title`，session 保存 `url: cleanUrl`，CSV 导出明确包含 `URL` 列。

这与 PRD / 技术方案中的隐私要求冲突：

- 不保存完整 URL。
- 如需区分路径，只保存 URL pattern。
- 默认不导出完整 URL。
- 不保存 prompt 内容、AI 输出、页面正文。

影响：

- 用户隐私承诺被破坏。
- 对话页面路径、文档路径、项目路径可能泄露。
- Figma 中“不保存完整 URL query / 页面正文”的说明无法被代码支撑。

建议：

- raw event 不落盘完整 URL。
- session 只保存 `raw_domain` 和 `raw_url_pattern`。
- CSV 使用 shared schema 中的导出字段，不包含 URL 列。
- 如果需要调试完整 URL，必须是本地调试模式、短期内存态、默认关闭、不可导出。

### 2.10 Android 项目存在构建阻塞

位置：

- `android/app/src/main/AndroidManifest.xml:20`
- `android/app/src/main/AndroidManifest.xml:22`
- `android/app/build.gradle.kts:24`
- `android/app/build.gradle.kts:28`
- `android/app/build.gradle.kts:30`

问题：

Manifest 引用了：

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

但 `android/app/src/main/res` 下只有：

- `values/strings.xml`
- `values/themes.xml`

没有 `mipmap` 图标资源。

同时 release 配置引用：

```kotlin
proguardFiles(
    getDefaultProguardFile("proguard-android-optimize.txt"),
    "proguard-rules.pro"
)
```

但 `android/app/proguard-rules.pro` 不存在。

仓库也没有 `android/gradlew`，当前环境没有可用 `gradle`。

影响：

- Android 无法可靠构建。
- release 构建必然失败。
- 仓库不具备可复现工程能力。

建议：

- 补齐 Gradle wrapper。
- 补齐 launcher icon / adaptive icon 资源。
- 补齐 `proguard-rules.pro`。
- 建立 `./gradlew assembleDebug` 和 `./gradlew test` 的验证入口。

## 3. P1 高风险问题

### 3.1 三端数据模型严重不一致

位置：

- `shared/schemas/detected-session.schema.json:9`
- `shared/schemas/detected-session.schema.json:14`
- `shared/schemas/detected-session.schema.json:44`
- `browser-extension/src/shared/enums.js:7`
- `browser-extension/src/shared/enums.js:27`
- `browser-extension/src/shared/enums.js:37`
- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:6`
- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:26`
- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:46`

问题：

shared schema 定义：

```json
"source_platform": ["macos", "android", "browser"]
"source_kind": ["app", "web"]
"status": ["pending", "completed", "ignored", "merged", "suspected"]
```

浏览器扩展却定义：

```js
browser-chatgpt
browser-claude
browser-deepseek
```

Android 定义：

```kotlin
MOBILE_APP
WEB
DESKTOP
```

影响：

- 三端导出的数据无法合并。
- Figma 中的平台筛选和统计口径无法实现。
- 周报、疲劳指数、工具排行、平台分布会出现错误。

建议：

- shared schema 作为唯一真实来源。
- 三端分别映射到同一套字段：
  - `source_platform = macos | android | browser`
  - `source_kind = app | web`
  - `tool_id = chatgpt | deepseek | doubao`
  - `status = pending | completed | ignored | merged | suspected`

### 3.2 LedgerEntry 字段与技术方案不一致

位置：

- `shared/schemas/ledger-entry.schema.json:19`
- `shared/schemas/ledger-entry.schema.json:24`
- `shared/schemas/ledger-entry.schema.json:29`
- `shared/schemas/ledger-entry.schema.json:34`
- `shared/schemas/ledger-entry.schema.json:39`
- `shared/schemas/ledger-entry.schema.json:44`
- `shared/schemas/ledger-entry.schema.json:49`
- `shared/schemas/ledger-entry.schema.json:53`
- `browser-extension/src/shared/types.js:56`
- `browser-extension/src/shared/types.js:61`
- `browser-extension/src/shared/types.js:62`
- `browser-extension/src/shared/types.js:64`
- `browser-extension/src/shared/types.js:65`

问题：

shared schema 使用分钟维度：

- `estimated_saved_minutes`
- `prompt_minutes`
- `review_minutes`
- `edit_minutes`
- `debug_minutes`
- `rework_minutes`
- `total_extra_cost_minutes`
- `net_gain_minutes`

浏览器扩展内部使用另一套模型：

- `duration`
- `qualityScore`
- `extraCostFraction`
- `netGain`
- `moodWeight`

影响：

- 浏览器端补全记录无法与 macOS / Android 统一计算。
- CSV 和周报字段会错位。
- “AI 净收益 = 估计节省时间 - Prompt 时间 - 审核时间 - 修改时间 - Debug 时间 - 返工时间”的核心公式无法跨端成立。

建议：

- 浏览器扩展补全页和 entry calculator 改为 shared ledger schema。
- 所有单位统一为 minutes。
- 如果 UI 中需要快捷比例，应在提交前转换为明确分钟字段。

### 3.3 Prompt Count 被默认开启，偏离 P1 / 可选定义

位置：

- `browser-extension/src/shared/storage.js:20`
- `browser-extension/src/shared/storage.js:23`
- `browser-extension/manifest.json:46`
- `browser-extension/manifest.json:65`

问题：

默认配置为：

```js
promptCountingEnabled: true
```

并且 manifest 默认向 AI 网站注入 `prompt-counter.js`。

PRD / 技术方案对 Prompt Count 的定义是：

- P1。
- 可选。
- 只计数，不保存 prompt 内容。
- 不应成为 P0 默认监测行为。

影响：

- 用户会把产品理解为“监控输入行为”。
- 浏览器商店审核解释成本上升。
- 与 Figma 中隐私边界说明不一致。

建议：

- P0 默认关闭 Prompt Count。
- 不默认注入 content script，或只在用户显式开启后注入。
- 设置页应明确说明只计数、不读取文本、不保存内容。

### 3.4 Android 前台服务被放进默认 Manifest

位置：

- `android/app/src/main/AndroidManifest.xml:7`
- `android/app/src/main/AndroidManifest.xml:8`
- `android/app/src/main/AndroidManifest.xml:9`
- `android/app/src/main/AndroidManifest.xml:37`
- `android/app/src/main/AndroidManifest.xml:40`
- `android/app/src/main/java/com/murmur/app/service/DetectionForegroundService.kt:12`

问题：

Android P0 技术方案是通过 `UsageStatsManager + WorkManager` 做周期回补检测。前台服务属于 P1 增强，但当前 Manifest 默认申请：

- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_SPECIAL_USE`

并声明 `DetectionForegroundService`。

影响：

- Google Play 审核风险上升。
- 用户对常驻检测的隐私担忧上升。
- 与 P0 范围不一致。

建议：

- P0 移除默认前台服务声明。
- P1 作为高级模式或 flavor 单独开启。
- 如果保留，需要补充用途声明、通知文案、用户开关和隐私说明。

### 3.5 浏览器扩展 session 状态机不符合 shared schema

位置：

- `shared/schemas/detected-session.schema.json:44`
- `browser-extension/src/shared/enums.js:37`
- `browser-extension/src/background/sessionizer.js:99`
- `browser-extension/src/background/sessionizer.js:137`
- `browser-extension/src/background/sessionizer.js:153`
- `browser-extension/src/background/sessionizer.js:254`
- `browser-extension/src/background/sessionizer.js:287`

问题：

shared schema 的状态是：

- `pending`
- `completed`
- `ignored`
- `merged`
- `suspected`

浏览器扩展使用：

- `completed`
- `paused`
- `abandoned`
- `suspected-abandoned`
- `needs-completion`
- `ignored`
- `merged`

同时 `activateSession()` 仍设置为 `PAUSED`：

```js
session.status = SessionStatus.PAUSED
```

影响：

- 待补全列表无法统一识别 pending session。
- 导出和跨端汇总需要额外转换，容易遗漏。
- popup 中“当前会话”状态可能显示错误。

建议：

- 内部运行态和持久化状态分离。
- 持久化状态统一使用 shared schema。
- 浏览器端 active / paused 只作为内存状态，不直接写入 detected session schema。

### 3.6 浏览器导出功能有实现 bug

位置：

- `browser-extension/src/export/csv-exporter.js:143`
- `browser-extension/src/export/csv-exporter.js:144`

问题：

当前代码：

```js
const blob = new Blob(['﻿' + content, { type: mimeType }]);
```

`{ type: mimeType }` 被放进了 Blob 内容数组，而不是 options 参数。

影响：

- 导出的 CSV 可能包含 `[object Object]`。
- MIME type 未正确设置。

建议：

应改为：

```js
const blob = new Blob(['\ufeff' + content], { type: mimeType });
```

### 3.7 Options 页存在潜在 XSS 注入点

位置：

- `browser-extension/src/options/options.js:180`
- `browser-extension/src/options/options.js:192`
- `browser-extension/src/options/options.js:241`
- `browser-extension/src/options/options.js:257`

问题：

Options 页使用 `innerHTML` 渲染 domain：

```js
tag.innerHTML = `${domain}<button ...>`
```

以及：

```js
info.innerHTML = `
  <span class="ignored-domain">${item.domain}</span>
`
```

虽然新增域名时有基础正则校验，但 storage、import、旧数据或外部消息仍可能带入异常字符串。

影响：

- Options 页存在 HTML 注入风险。
- 浏览器扩展页面权限较高，安全边界应更保守。

建议：

- 使用 `textContent` 创建文本节点。
- `data-domain` 使用 DOM API 设置。
- 对 storage 中历史 domain 做二次 sanitize。

## 4. P2 质量与一致性问题

### 4.1 macOS 持久化没有按技术方案使用 SQLite / GRDB

位置：

- `macos/Murmur/Storage/StorageManager.swift:3`
- `macos/Murmur/Storage/StorageManager.swift:43`
- `macos/Murmur/Storage/StorageManager.swift:47`
- `macos/Murmur/Storage/StorageManager.swift:53`
- `macos/Murmur/Storage/StorageManager.swift:57`

问题：

技术方案推荐 macOS 使用 SQLite + GRDB，但当前使用 JSON 文件保存 sessions、entries、tool catalog、settings 等。

影响：

- 并发写入、迁移、索引、聚合统计能力不足。
- 数据量增长后今日页、统计页和周报性能不稳定。
- 与 Android Room / Browser IndexedDB 的结构化模型不一致。

建议：

- 若定位为真实 App，应尽快迁移到 SQLite。
- 若短期保留 JSON，应明确为 prototype storage，并补充串行写队列、迁移版本和数据校验。

### 4.2 macOS 存在本机绝对路径

位置：

- `macos/Murmur/Storage/StorageManager.swift:151`

问题：

工具目录 fallback 到：

```swift
URL(fileURLWithPath: "/Users/rockygao/QTM/Murmur/shared/tool-catalog.json")
```

影响：

- 安装包、其他机器、CI 环境全部失效。
- 工具目录可能为空，自动检测无法匹配。

建议：

- 工具目录必须作为 bundle resource。
- 开发环境 fallback 应使用相对路径或编译配置，不能写死用户目录。

### 4.3 浏览器扩展没有真正落地 TypeScript 技术栈

位置：

- `browser-extension/package.json`
- `browser-extension/tsconfig.json`
- `browser-extension/src/**/*.js`

问题：

技术方案写的是 TypeScript / Manifest V3，但当前核心实现为 plain JavaScript。`tsconfig` 只能对 JS 做有限检查，不能替代强类型模型约束。

影响：

- shared schema 与浏览器端类型偏离时不容易被编译发现。
- session / ledger 字段错配风险高。

建议：

- 逐步迁移核心模块到 TypeScript。
- 使用 shared schema 生成类型，或至少建立 schema validation 测试。

### 4.4 Browser Extension 使用 chrome.storage.local 保存数组，后期可扩展性不足

位置：

- `browser-extension/src/shared/storage.js:40`
- `browser-extension/src/shared/storage.js:55`
- `browser-extension/src/shared/storage.js:71`

问题：

当前 session 和 entry 都以数组形式存入 `chrome.storage.local`。每次新增或更新都读取全量数组再整体写回。

影响：

- 数据量增长后性能下降。
- 并发写入可能覆盖。
- 查询今日、周报、工具排行时效率较低。

建议：

- P0 可暂时接受，但应限制数据量并加 migration。
- 正式版建议改为 IndexedDB。

## 5. 与 PRD / Figma 的关键偏差

### 5.1 自动检测主线没有完整闭环

Figma 原型中核心链路是：

```text
自动检测 AI 使用会话
→ Detected Session
→ 待补全会话
→ Completion
→ Ledger Entry
→ 今日净收益 / 疲劳指数 / 周报
```

当前问题：

- macOS 检测 session 没有可靠持久化。
- 浏览器 session 模型与 schema 不一致。
- Android 可以产生 session，但构建阻塞且状态命名不统一。
- 三端 Ledger Entry 字段不一致。

### 5.2 隐私承诺与浏览器扩展实现冲突

Figma 和文档反复强调：

- 不保存 prompt。
- 不保存 AI 输出。
- 不保存完整敏感 URL。
- 只保存工具、域名、时间和用户补全字段。

当前浏览器扩展保存并导出 URL 字段，属于必须优先修正的问题。

### 5.3 P0 / P1 范围混杂

P1 能力包括：

- Browser Prompt Count。
- Browser idle detection。
- Native Messaging。
- Android foreground service。
- macOS window title / Accessibility 增强。

当前已有多个 P1 能力进入默认配置或 manifest，导致 MVP 范围变重。

## 6. 构建验证结果

### 6.1 Browser Extension

执行：

```bash
npm --prefix browser-extension run build
```

结果：

```text
Error: Cannot find module '/Users/rockygao/QTM/Murmur/browser-extension/scripts/build.js'
```

结论：

浏览器扩展声明的构建命令不可用。

### 6.2 macOS

检查结果：

- 未发现 `.xcodeproj`
- 未发现 `.xcworkspace`
- 未发现 `Package.swift`

结论：

无法执行 macOS 构建验证。

### 6.3 Android

检查结果：

- 未发现 `android/gradlew`
- 未发现 `android/app/proguard-rules.pro`
- 未发现 launcher mipmap 图标资源

结论：

Android 仓库不具备可复现构建能力，release 构建存在明确阻塞。

## 7. 建议修复优先级

### 第一优先级：让三端可构建

- macOS 补齐 Xcode 工程或 Swift Package。
- Android 补齐 Gradle wrapper、图标资源、ProGuard 文件。
- Browser Extension 补齐 build script 和 manifest 校验。

### 第二优先级：统一 shared schema

- 以 `shared/schemas/detected-session.schema.json` 为唯一 detected session 定义。
- 以 `shared/schemas/ledger-entry.schema.json` 为唯一 ledger entry 定义。
- 三端全部映射到统一字段，不允许各端自定义平台枚举和状态枚举。

### 第三优先级：修正隐私边界

- 浏览器端不保存完整 URL。
- CSV 不导出 URL。
- Prompt Count 默认关闭。
- Native Messaging / idle / foreground service 默认不启用。

### 第四优先级：打通自动检测闭环

- macOS 检测结果持久化。
- Android session 状态统一为 pending / suspected。
- Browser session 写入 shared schema。
- 待补全页只消费 `detected_sessions` 中未完成记录。
- Completion 保存后更新 session 状态为 completed。

### 第五优先级：补充测试和验收

- 增加 schema validation。
- 增加 sessionizer 单元测试。
- 增加 CSV export snapshot 测试。
- 增加三端 fixture 对齐测试。
- 建立 CI：macOS build、Android assembleDebug、Browser manifest/build 校验。

## 8. 最终判断

当前项目方向和产品设计是成立的，但代码实现还没有达到“完成三端实现”的标准。最核心的问题不是 UI 缺少细节，而是底层工程能力和数据契约没有稳定下来。

建议先冻结新增功能，集中完成：

1. 三端可构建。
2. schema 统一。
3. 隐私承诺落地。
4. 自动检测到待补全账本的闭环。

完成这四项后，再继续推进统计页、周报、Native Messaging、Prompt Count 和前台服务等增强能力。
