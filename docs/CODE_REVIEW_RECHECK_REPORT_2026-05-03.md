# Murmur 修复后代码复审报告

复审日期：2026-05-03  
复审依据：`docs/CODE_REVIEW_FIX_REPORT_2026-05-03.md`、原 PRD / 技术方案、shared schema、三端当前代码。  
复审方式：只读审查；除运行浏览器扩展 build 验证外，未修改业务代码。运行 build 产生的 `browser-extension/dist` 已清理。

## 1. 总体结论

本轮修复确实解决了一部分明确问题，例如：

- macOS 移除了 `@NSApplicationDelegateAdaptor` 手动重赋值。
- macOS `CompletionViewModel.useCases` 命名冲突已修复。
- macOS 检测回调到 `StorageManager` 的持久化闭环有了初步绑定。
- 浏览器扩展 `npm run build` 不再因为缺少 `scripts/build.js` 失败。
- 浏览器扩展主 CSV exporter 去掉了完整 URL 字段。
- 浏览器扩展默认关闭了 `promptCountingEnabled`。
- Android Manifest 移除了默认前台服务声明。
- Android 补了 `proguard-rules.pro` 和 adaptive icon XML 资源。

但当前实现仍不能判定为“三端完成”。修复报告中“P0 阻塞问题 10 项全部修复”的结论不成立。复审发现新的和残留的 P0 问题，尤其是：

- Android 端当前代码存在明确编译错误。
- 浏览器扩展自动检测主链路被字段迁移打断，AI 网站无法匹配工具。
- 浏览器扩展 manifest 引用的 PNG 图标不存在，build 脚本未检出。
- 浏览器扩展大量调用方仍使用旧字段 `startTime/endTime/duration/domain`，与新 schema 半迁移。
- Options 页仍导出 `URL` 列，隐私修复不完整。
- macOS 仍没有 `.xcodeproj` / `.xcworkspace` / `Package.swift`，无法构建。
- Android 仍没有 `gradlew`，无法复现构建。

## 2. 修复报告与实际代码不一致

### 2.1 “P0 全部修复”的表述不成立

位置：

- `docs/CODE_REVIEW_FIX_REPORT_2026-05-03.md:10`
- `docs/CODE_REVIEW_FIX_REPORT_2026-05-03.md:307`
- `docs/CODE_REVIEW_FIX_REPORT_2026-05-03.md:311`
- `docs/CODE_REVIEW_FIX_REPORT_2026-05-03.md:312`

问题：

修复报告前面写“P0 阻塞问题：10 项全部修复”，但后面又列出：

- macOS 无 `.xcodeproj` 暂未修改。
- Android 无 `gradlew` 暂未修改。

这两项在原审查中属于构建级 P0 阻塞。它们没有修复，不能统计为 P0 全部修复。

影响：

- 当前项目仍无法完成三端可复现构建。
- 复审和后续排期如果相信“P0 清零”，会误判项目状态。

建议：

- 修复报告应改为“部分 P0 修复，构建工程类 P0 未修复”。
- 将 macOS 工程文件、Android Gradle wrapper 列为下一轮首要修复。

## 3. P0 阻塞问题

### 3.1 Android 当前代码存在明确编译错误

位置：

- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:161`
- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:162`
- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:185`
- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt:264`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:58`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:66`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:67`
- `android/app/src/main/java/com/murmur/app/ui/today/TodayViewModel.kt:108`

问题：

修复后 `SourcePlatform` 只有：

```kotlin
MACOS("macos"), ANDROID("android"), BROWSER("browser")
```

`SourceKind` 只有：

```kotlin
APP("app"), WEB("web")
```

`SessionStatus` 只有：

```kotlin
PENDING, COMPLETED, IGNORED, MERGED, SUSPECTED
```

但代码仍引用已不存在的枚举：

```kotlin
SourcePlatform.MOBILE_APP
SourceKind.FOREGROUND_APP
SessionStatus.ACTIVE
```

影响：

- Android 端无法编译。
- `Sessionizer`、`TodayViewModel`、domain model 默认值都会报 unresolved reference。

建议：

- 全量替换：
  - `SourcePlatform.MOBILE_APP` → `SourcePlatform.ANDROID`
  - `SourceKind.FOREGROUND_APP` → `SourceKind.APP`
  - `SessionStatus.ACTIVE` → `SessionStatus.PENDING`
- 增加一次最小编译验证，至少 `./gradlew assembleDebug`。

### 3.2 Android 状态持久化仍混用大小写，待补全列表会失效

位置：

- `android/app/src/main/java/com/murmur/app/data/local/dao/DetectedSessionDao.kt:16`
- `android/app/src/main/java/com/murmur/app/data/local/dao/DetectedSessionDao.kt:35`
- `android/app/src/main/java/com/murmur/app/data/local/dao/DetectedSessionDao.kt:36`
- `android/app/src/main/java/com/murmur/app/data/repository/LedgerRepository.kt:81`
- `android/app/src/main/java/com/murmur/app/data/repository/SessionRepository.kt:94`

问题：

实体默认值已改为小写 `pending/suspected/completed`，但 DAO 和 repository 仍有大写状态：

```sql
status = 'ACTIVE' OR status = 'SUSPECTED'
status = 'COMPLETED'
```

以及：

```kotlin
sessionDao.updateStatus(entry.sessionId, "COMPLETED", now)
dao.updateStatus(sourceId, "MERGED", now)
```

影响：

- `getPendingSessions()` 查不到小写 `pending/suspected`。
- 今日统计 pending/completed 数量会为 0。
- 补全后 session 被写成大写 `COMPLETED`，再经 `fromString()` 虽然可转 enum，但数据库聚合逻辑仍错。

建议：

- SQL 全部改为小写 schema 值：`pending/suspected/completed/merged`。
- 禁止在 repository 中写裸字符串，统一使用 `SessionStatus.value`。

### 3.3 Browser Extension 自动检测匹配链路被打断

位置：

- `browser-extension/src/background/detector.js:62`
- `browser-extension/src/background/detector.js:71`
- `browser-extension/src/background/detector.js:72`
- `browser-extension/src/background/tool-matcher.js:147`
- `browser-extension/src/background/tool-matcher.js:148`
- `browser-extension/src/background/tool-matcher.js:151`
- `browser-extension/src/background/tool-matcher.js:152`

问题：

`detector.js` 修复后 raw event 只提供：

```js
domain
urlPattern
```

不再提供完整 `url`。

但 `tool-matcher.js` 仍然写着：

```js
const url = rawEvent.url;
const domain = rawEvent.domain;

if (!url || !domain) {
  return { tool: null, ... };
}
```

因为 `rawEvent.url` 永远不存在，所以所有浏览器事件都会直接返回 `tool: null`。

影响：

- ChatGPT、DeepSeek、豆包等 AI 网站不会被识别。
- `sessionizer.startSession()` 不会被触发。
- 浏览器扩展 P0 自动检测能力实际不可用。

建议：

- `matchEvent()` 改为使用 `rawEvent.domain` 和 `rawEvent.urlPattern`。
- URL pattern 匹配不应依赖完整 URL，应匹配 normalized pattern。
- 为 `chat.deepseek.com`、`doubao.com` 等 fixture 增加 matcher 单元测试。

### 3.4 Browser Extension manifest 引用的图标文件不存在

位置：

- `browser-extension/manifest.json:39`
- `browser-extension/manifest.json:40`
- `browser-extension/manifest.json:41`
- `browser-extension/manifest.json:47`
- `browser-extension/manifest.json:48`
- `browser-extension/manifest.json:49`
- `browser-extension/scripts/build.js:76`

问题：

Manifest 引用了：

```json
"icons/icon16.png"
"icons/icon48.png"
"icons/icon128.png"
```

但 `browser-extension/icons/` 下实际只有：

```text
icon.svg
README.md
```

我验证了：

```text
icon16=1
icon48=1
icon128=1
```

`npm run build` 虽然成功，但 build script 只检查 `manifest.icons` 是对象，没有校验图标文件真实存在。

影响：

- Chrome 加载 unpacked extension 时可能直接报资源缺失。
- 商店发布无法通过资源校验。
- build 成功会给开发者造成误判。

建议：

- 生成并提交 16/48/128 PNG 图标。
- build script 校验 manifest 中所有 icon path 存在。
- 或者 manifest 回退到真实存在且浏览器支持的图标资源。

### 3.5 Browser Extension schema 迁移只改了部分文件，运行态大量字段仍是旧模型

位置：

- `browser-extension/src/shared/storage.js:94`
- `browser-extension/src/shared/storage.js:98`
- `browser-extension/src/shared/storage.js:105`
- `browser-extension/src/shared/storage.js:107`
- `browser-extension/src/background/service-worker.js:251`
- `browser-extension/src/background/service-worker.js:253`
- `browser-extension/src/background/service-worker.js:263`
- `browser-extension/src/background/service-worker.js:264`
- `browser-extension/src/background/service-worker.js:265`
- `browser-extension/src/background/service-worker.js:267`
- `browser-extension/src/popup/popup.js:223`
- `browser-extension/src/popup/popup.js:224`
- `browser-extension/src/popup/popup.js:229`

问题：

新的 session 使用：

```js
rawDomain
startedAt
endedAt
activeSeconds
status: pending / suspected
```

但大量调用方仍读取旧字段：

```js
domain
startTime
endTime
duration
SessionStatus.NEEDS_COMPLETION
SessionStatus.SUSPECTED_ABANDONED
```

影响：

- `getSessionsByDate()` 用 `s.startTime` 过滤，永远匹配不到新 session。
- popup 当前会话 timer 会拿到 `undefined` startTime，显示 NaN 或异常。
- 今日统计总时长使用 `s.duration`，结果为 0。
- pending count 使用已不存在的状态，结果为 0。

建议：

- 浏览器扩展全量迁移字段：
  - `startTime` → `startedAt`
  - `endTime` → `endedAt`
  - `duration` → `activeSeconds`
  - `domain` → `rawDomain`
  - `sessionId` → `detectedSessionId`
- 增加一条真实 session fixture，从 detector → service worker → popup status → CSV 全链路测试。

### 3.6 Browser Extension Options 页仍导出 URL，隐私修复不完整

位置：

- `browser-extension/src/options/options.js:321`
- `browser-extension/src/options/options.js:322`
- `browser-extension/src/options/options.js:323`
- `browser-extension/src/options/options.js:329`
- `browser-extension/src/options/options.js:330`
- `browser-extension/src/options/options.js:331`
- `browser-extension/src/options/options.js:332`

问题：

独立 `csv-exporter.js` 已去掉完整 URL，但 Options 页自己的 `onExportSessions()` 仍手写旧 CSV：

```js
'ID', '工具', '域名', 'URL', ...
s.domain
s.url
new Date(s.startTime)
s.endTime
s.duration
```

影响：

- 用户从 Options 页导出仍会出现 `URL` 列。
- 即使新 session 不再写 `url`，旧数据或迁移前数据仍可能被导出。
- “默认不导出完整 URL”的隐私承诺仍未完全落地。

建议：

- Options 页不要维护第二套 CSV 逻辑。
- 统一调用 `exportSessionsCSV()`。
- 对历史 `url` 字段做迁移清理或导出时强制忽略。

### 3.7 macOS 仍没有可构建工程

位置：

- `macos/`

问题：

复审仍未发现：

- `.xcodeproj`
- `.xcworkspace`
- `Package.swift`
- `.pbxproj`

影响：

- macOS 无法构建。
- AppDelegate / SwiftUI / resource bundle 的修复无法被编译验证。
- `macos/Murmur/Resources/tool-catalog.json` 是否进入 bundle 也无法确认。

建议：

- 立即补齐 Xcode 工程。
- 将所有 Swift 文件和 resource 明确纳入 target。
- 增加 `xcodebuild` 验证命令。

### 3.8 Android 仍没有 Gradle wrapper

位置：

- `android/`

问题：

复审仍未发现 `android/gradlew`。

影响：

- 仓库无法被 CI 或其他开发者稳定构建。
- 当前 Android 编译错误也无法通过标准命令快速暴露。

建议：

- 用 Android Studio 或本机 Gradle 生成 wrapper。
- 提交 `gradlew`、`gradlew.bat`、`gradle/wrapper/gradle-wrapper.jar`、`gradle-wrapper.properties`。

## 4. P1 高风险问题

### 4.1 Android LedgerEntry 仍不是 PRD / shared schema 的分钟字段

位置：

- `shared/schemas/ledger-entry.schema.json:19`
- `shared/schemas/ledger-entry.schema.json:24`
- `shared/schemas/ledger-entry.schema.json:29`
- `shared/schemas/ledger-entry.schema.json:34`
- `shared/schemas/ledger-entry.schema.json:39`
- `shared/schemas/ledger-entry.schema.json:44`
- `shared/schemas/ledger-entry.schema.json:49`
- `shared/schemas/ledger-entry.schema.json:53`
- `android/app/src/main/java/com/murmur/app/data/local/entity/LedgerEntryEntity.kt:21`
- `android/app/src/main/java/com/murmur/app/data/local/entity/LedgerEntryEntity.kt:48`
- `android/app/src/main/java/com/murmur/app/data/local/entity/LedgerEntryEntity.kt:51`
- `android/app/src/main/java/com/murmur/app/data/local/entity/LedgerEntryEntity.kt:54`

问题：

shared schema 要求：

- `detected_session_id`
- `estimated_saved_minutes`
- `prompt_minutes`
- `review_minutes`
- `edit_minutes`
- `debug_minutes`
- `rework_minutes`
- `total_extra_cost_minutes`
- `net_gain_minutes`

Android 仍使用旧字段：

- `session_id`
- `time_saved_seconds`
- `extra_cost_seconds`
- `net_gain_seconds`
- `input_count`
- `output_count`

影响：

- Android 账本与 PRD 的补全表单不一致。
- 无法记录 Prompt / 审核 / 修改 / Debug / 返工分项。
- 跨端 CSV、周报、疲劳指数无法统一。

建议：

- Android Room schema 按 shared ledger schema 重建或迁移。
- UI Completion 页改为录入分钟分项，而不是输入/输出次数。

### 4.2 Android EntryCalculator 公式已失真

位置：

- `android/app/src/main/java/com/murmur/app/domain/calculator/EntryCalculator.kt:15`
- `android/app/src/main/java/com/murmur/app/domain/calculator/EntryCalculator.kt:16`
- `android/app/src/main/java/com/murmur/app/domain/calculator/EntryCalculator.kt:22`
- `android/app/src/main/java/com/murmur/app/domain/calculator/EntryCalculator.kt:26`
- `android/app/src/main/java/com/murmur/app/domain/calculator/EntryCalculator.kt:27`

问题：

`OutputQuality.qualityScore` 已改为 1-4，`UserMood.moodWeight` 已改为 0/2/6/8/10，但 calculator 仍按旧的 0-1 浮点权重使用：

```kotlin
timeSavedSeconds = activeSeconds * qualityScore * moodWeight
qualityPenalty = activeSeconds * (1.0f - qualityScore)
moodPenalty = activeSeconds * (1.0f - moodWeight)
```

影响：

- `DIRECT_USE + ANXIOUS` 可能被计算成远超实际时长的节省。
- `qualityPenalty` 对 2/3/4 会变成负数。
- 净收益和疲劳指数严重失真。

建议：

- 按 PRD 改为分钟公式：

```text
net_gain_minutes = estimated_saved_minutes
  - prompt_minutes
  - review_minutes
  - edit_minutes
  - debug_minutes
  - rework_minutes
```

- `qualityScore / qualityPenalty / moodWeight` 只用于疲劳指数，不用于直接乘 activeSeconds。

### 4.3 Browser Extension Native Messaging 仍默认尝试连接

位置：

- `browser-extension/src/background/service-worker.js:173`
- `browser-extension/src/background/service-worker.js:177`
- `browser-extension/src/background/service-worker.js:188`
- `browser-extension/src/background/service-worker.js:193`
- `browser-extension/src/background/service-worker.js:199`
- `browser-extension/src/background/service-worker.js:205`
- `browser-extension/src/background/service-worker.js:544`
- `browser-extension/src/background/service-worker.js:546`
- `browser-extension/src/background/service-worker.js:547`

问题：

Manifest 已移除 `nativeMessaging` 权限，settings 也默认 `nativeMessagingEnabled: false`，但 service worker 仍在 install/startup/startupCheck 中无条件调用 `tryConnectNativeMessaging()`。

影响：

- P1 能力没有真正做到 opt-in。
- 无权限情况下会反复尝试连接 native host。
- 用户和审核侧仍会看到代码行为与权限/文档表述不一致。

建议：

- 只有 `settings.nativeMessagingEnabled === true` 时才 import / connect / expose native messaging。
- `connectNative` 消息处理也应检查设置和权限。

### 4.4 Browser Extension Prompt Count 变成“默认关闭但不可用/未闭环”

位置：

- `browser-extension/manifest.json`
- `browser-extension/src/content/prompt-counter.js`
- `browser-extension/src/background/service-worker.js:485`

问题：

Manifest 已移除 `content_scripts`，但代码里未看到 `chrome.scripting.executeScript` 或其他显式开启后的注入路径。也就是说 Prompt Count 从“默认开启”变成了“无法被正常启用”。

影响：

- P1 功能虽然不再越界，但实现未闭环。
- 设置页如果提供开关，用户开启后也不会有实际统计。

建议：

- P1 后续实现时添加 `scripting` optional permission。
- 用户开启后仅对选定 AI 域名注入，并在关闭时停止监听。

### 4.5 Browser Extension calculators 仍使用旧账本模型

位置：

- `browser-extension/src/calculator/entry-calculator.js:11`
- `browser-extension/src/calculator/entry-calculator.js:51`
- `browser-extension/src/calculator/entry-calculator.js:62`
- `browser-extension/src/calculator/entry-calculator.js:118`
- `browser-extension/src/calculator/entry-calculator.js:120`
- `browser-extension/src/calculator/fatigue-calculator.js:67`
- `browser-extension/src/calculator/fatigue-calculator.js:118`
- `browser-extension/src/calculator/fatigue-calculator.js:146`
- `browser-extension/src/calculator/weekly-review.js:27`
- `browser-extension/src/calculator/weekly-review.js:39`

问题：

浏览器 types 已声明新的 `estimatedSavedMinutes / promptMinutes / netGainMinutes` 等字段，但 calculators 仍使用：

- `duration`
- `extraCostFraction`
- `netGain(hours)`
- `outputQuality = excellent/good/neutral`
- `mood = great/frustrated/rushed`
- `startTime/endTime`

影响：

- 浏览器端补全、疲劳、周报仍无法与 shared schema 对齐。
- 即使 session 写入成功，统计也会因为字段错配而为 0 或错误。

建议：

- calculators 与 `types.js` 一起迁移。
- 删除旧枚举和旧字段兼容逻辑，或明确写 migration adapter。

### 4.6 macOS Sessionizer 切换不同 AI 工具时会把会话错误合并

位置：

- `macos/Murmur/Detection/Sessionizer.swift:49`
- `macos/Murmur/Detection/Sessionizer.swift:50`
- `macos/Murmur/Detection/Sessionizer.swift:51`
- `macos/Murmur/Detection/Sessionizer.swift:52`

问题：

当当前处于 AI session 中，只要新事件仍是 AI，代码就认为是在“Continuing AI session”，没有检查 `toolId` 是否变化。

影响：

用户从 ChatGPT 切到 Claude，或从 Cursor 切到 Codex，可能仍被记录成同一个工具的连续 session。

建议：

- 如果 `currentSession.toolId != matchResult.matchedTool?.id`，应先 flush 当前 session，再开启新 session。

### 4.7 macOS 跨午夜拆分夜间标记写死为 true

位置：

- `macos/Murmur/Detection/Sessionizer.swift:112`

问题：

第一段 session 的夜间标记：

```swift
first.isNight = isNightHours(session.startedAt) || true
```

这会让所有跨午夜第一段永远是 night。

影响：

- 夜间使用统计偏高。
- 疲劳指数会被放大。

建议：

- 改为 `isNightHours(session.startedAt) || isNightHours(midnight.addingTimeInterval(-1))`，或按分钟切片精确判断。

### 4.8 浏览器扩展仍使用 camelCase 存储 schema，不是 shared JSON schema 字段

位置：

- `shared/schemas/detected-session.schema.json:9`
- `shared/schemas/detected-session.schema.json:31`
- `shared/schemas/ledger-entry.schema.json:9`
- `browser-extension/src/shared/types.js:30`
- `browser-extension/src/shared/types.js:41`
- `browser-extension/src/shared/types.js:59`
- `browser-extension/src/background/sessionizer.js:52`
- `browser-extension/src/background/sessionizer.js:63`

问题：

shared JSON schema 字段是 snake_case：

- `source_platform`
- `source_kind`
- `started_at`
- `detected_session_id`

浏览器扩展内部和存储字段是 camelCase：

- `sourcePlatform`
- `sourceKind`
- `startedAt`
- `detectedSessionId`

影响：

- 直接导出的 JSON 不符合 shared schema。
- Native Messaging 与 macOS 当前也使用 camelCase payload，形成另一套隐式协议。

建议：

- 明确区分 internal model 和 persisted/exported schema。
- 持久化和导出统一使用 snake_case，UI 内部可使用 adapter 转 camelCase。

## 5. P2 质量问题

### 5.1 Build script 校验覆盖不足

位置：

- `browser-extension/scripts/build.js:76`
- `browser-extension/scripts/build.js:80`
- `browser-extension/scripts/build.js:87`

问题：

Build script 只检查源码文件和少量 manifest 结构，没有检查：

- manifest 引用的 icon 文件是否存在。
- service worker importScripts 文件是否存在且可加载。
- 是否仍引用移除后的 enum。
- 是否仍有完整 URL 导出路径。

影响：

当前 `npm run build` 成功，但扩展仍有 P0 资源缺失和功能断链。

建议：

- 增加 manifest resource validation。
- 增加 `rg` 风格的 forbidden fields 检查，例如禁止导出 `s.url`。
- 增加 smoke test：模拟 `rawEvent` 匹配 DeepSeek 域名。

### 5.2 macOS 仍使用 JSON 文件存储

位置：

- `macos/Murmur/Storage/StorageManager.swift`

问题：

修复报告将 SQLite / GRDB 推迟到正式版。作为原型可以接受，但这仍是技术方案偏差。

影响：

- 并发写入和聚合查询仍不稳定。
- 后续迁移成本会随数据模型继续变化而上升。

建议：

- 至少在 JSON 阶段加版本号和 migration。
- 三端 schema 未稳定前不要继续扩展统计功能。

## 6. 验证结果

### 6.1 Browser Extension

执行：

```bash
npm --prefix browser-extension run build
```

结果：

```text
[Murmur Build] ✓ Build complete. Output: dist/
```

但该结果不足以证明扩展可用，因为 manifest 引用的 PNG 图标不存在，build script 未校验这些资源。

### 6.2 macOS

检查结果：

未发现 `.xcodeproj`、`.xcworkspace`、`Package.swift` 或 `.pbxproj`。

结论：

无法执行 macOS 构建验证。

### 6.3 Android

检查结果：

未发现 `android/gradlew`，当前环境也没有可用 `gradle` 命令。

静态审查已发现 Android 枚举引用编译错误，因此即使补齐 wrapper，当前代码也无法通过编译。

## 7. 建议下一轮修复顺序

### 第一优先级：恢复可编译

1. Android 清理所有已删除枚举引用。
2. Android DAO / Repository 状态值全部改为小写 schema 值。
3. Browser Extension 修复 `tool-matcher.js`，恢复 AI 域名匹配。
4. Browser Extension 补齐 manifest PNG 图标或调整 manifest。
5. macOS 补齐 Xcode 工程。
6. Android 补齐 Gradle wrapper。

### 第二优先级：完成 schema 迁移

1. 浏览器扩展所有旧字段迁移到 `startedAt/endedAt/activeSeconds/rawDomain`。
2. Android LedgerEntry 改为 shared ledger schema 的分钟分项。
3. 删除旧状态 `NEEDS_COMPLETION/SUSPECTED_ABANDONED/ACTIVE`。
4. 建立 adapter，明确 internal camelCase 与 persisted snake_case 的边界。

### 第三优先级：隐私和 P1 能力收口

1. Options 页导出统一走 `csv-exporter.js`。
2. Native Messaging 仅在设置开启后连接。
3. Prompt Count 保持 P1，后续用 optional permission 和显式注入实现。

### 第四优先级：测试

1. Browser matcher fixture：DeepSeek / 豆包 / ChatGPT 域名必须命中。
2. Browser service-worker getStatus fixture：当前 session 计时和今日统计必须正确。
3. Android 编译检查。
4. Android DAO 状态查询测试。
5. macOS sessionizer 测试：AI 工具切换、跨午夜拆分、idle flush。

## 8. 最终判断

本轮修复有进展，但整体处于“修复进行中，尚未稳定”的状态。最大问题不是缺少 UI，而是 schema 迁移没有全链路完成：新的字段和枚举被引入后，旧调用方仍大量存在，导致浏览器扩展自动检测不可用、Android 编译不可用、统计和导出结果不可信。

下一轮应先停止新增功能，集中处理：

1. Android 编译错误。
2. Browser Extension 自动检测 matcher 断链。
3. Browser Extension 图标资源缺失。
4. 旧字段全量迁移。
5. macOS / Android 可复现构建入口。

这些完成前，不建议继续声称“三端实现已完成”。
