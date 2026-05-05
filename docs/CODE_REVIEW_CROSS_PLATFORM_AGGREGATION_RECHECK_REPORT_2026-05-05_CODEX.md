# 跨平台 AI 使用统计二次审查报告

审查日期：2026-05-05  
审查人：Codex  
审查类型：修复后复核 / Release Readiness Gate  

## 参考文档

- `docs/CROSS_PLATFORM_AI_USAGE_AGGREGATION_PLAN.md`
- `docs/CODE_REVIEW_CROSS_PLATFORM_AGGREGATION_REPORT_2026-05-05_CODEX.md`
- `docs/CODE_REVIEW_FIX_REPORT_CROSS_PLATFORM_AGGREGATION_2026-05-05.md`

## 审查结论

当前仍 **不建议进入打包和发布准备环节**。

本轮复核确认，修复报告中提到的部分问题已经有实际改动，包括 Android 夜间跳过逻辑、Android session gap 过度计时、浏览器 finalized session 入队、多 active session recovery、`DetectedSession` initializer、`StorageManager.shared`、`DailySummary` 构造参数等。

但当前代码仍存在多个发布阻断问题：

1. Browser Extension Native Messaging 权限缺失，macOS manifest/helper 安装链路仍未闭合。
2. macOS 静态类型检查失败。
3. shared golden fixture 不是合法 JSON。
4. macOS 导入浏览器 session 时丢失浏览器侧 status。
5. 统一 deduped 聚合口径仍未接入主要 UI。
6. 浏览器相邻合并后，同步对象仍可能不是最终被保留的 merged target session。

## Findings

### P1：Native Messaging 仍无法发布可用

涉及文件：

- `browser-extension/manifest.json:7`
- `browser-extension/dist/manifest.json:7`
- `browser-extension/src/background/native-messaging.js:31`
- `macos/Murmur/NativeMessaging/ManifestInstaller.swift:5`
- `macos/Murmur/ViewModels/SettingsViewModel.swift:162`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift:81`

问题说明：

浏览器侧 `native-messaging.js` 使用：

```js
chrome.runtime.connectNative(HOST_NAME)
```

但 `browser-extension/manifest.json` 的 `permissions` 当前只有：

```json
[
  "tabs",
  "webNavigation",
  "storage",
  "alarms"
]
```

缺少 Chrome Native Messaging 必需权限：

```json
"nativeMessaging"
```

`npm run build` 后生成的 `browser-extension/dist/manifest.json` 同样缺少该权限，因此即使 macOS 侧补了 `connection_ack`，浏览器扩展在发布包中仍无法正常调用 native host。

此外，macOS 侧 `ManifestInstaller` 当前没有任何调用点。设置页开启 Native Messaging 时仍然只是：

```swift
NativeMessagingHost.shared.start()
```

这会在主 App 进程中尝试读取标准输入，并不等价于 Chrome Native Messaging 的真实启动模型。Chrome 需要通过用户目录下的 native messaging manifest 找到一个可执行 host，并由浏览器拉起该 host。

当前缺失的发布闭环：

1. manifest 写入真实 extension id。
2. 安装到 Chrome / Edge NativeMessagingHosts 目录。
3. manifest `path` 指向真实可执行 native host。
4. 浏览器扩展声明 `nativeMessaging` 权限。
5. macOS App 设置页调用 `ManifestInstaller`。
6. native host 以独立 stdio 进程方式运行，而不是仅在主 App 内启动。

影响：

跨端网页使用数据无法可靠从浏览器进入 macOS，总体方案的核心链路不可用。

建议修复：

1. 在 extension manifest 中补充 `"nativeMessaging"` 权限。
2. 完成 macOS 设置页对 `ManifestInstaller.install(...)` / `uninstall(...)` 的接入。
3. 在设置页或首次引导中要求用户填入或自动读取真实 extension id。
4. 明确 native host 可执行文件路径，并确保打包时包含该 host。
5. 为 Native Messaging 做端到端手动验收：扩展发 session，macOS 收到并 upsert，扩展 sync queue 标记为 synced。

### P1：macOS 静态类型检查失败

涉及文件：

- `macos/Murmur/Detection/WindowTitleDetector.swift:1`
- `macos/Murmur/Detection/WindowTitleDetector.swift:41`
- `macos/Murmur/Aggregation/SessionAggregator.swift:44`
- `macos/Murmur/Aggregation/SessionAggregator.swift:127`

验证命令：

```bash
swiftc -typecheck $(find macos/Murmur -name '*.swift' | sort)
```

结果：

类型检查失败：

```text
macos/Murmur/Detection/WindowTitleDetector.swift:41:30: error: cannot find 'NSWorkspace' in scope
```

原因：

`WindowTitleDetector.swift` 使用了：

```swift
NSWorkspace.shared.frontmostApplication
```

但文件只导入了：

```swift
import Foundation
import ApplicationServices
import CryptoKit
```

缺少：

```swift
import AppKit
```

同时，`SessionAggregator.swift` 中 `promptCount` 在 `DetectedSession` 里是非 Optional `Int`，但代码仍写了：

```swift
current.promptCount ?? 0
next.promptCount ?? 0
$1.promptCount ?? 0
```

这些是 warning，不是当前的编译阻断，但建议一起清理。

影响：

macOS 侧无法通过基础 Swift 类型检查。即使仓库缺少 `.xcodeproj` / `.xcworkspace` / `Package.swift`，该静态错误仍应在打包前修复。

建议修复：

1. `WindowTitleDetector.swift` 增加 `import AppKit`。
2. 清理 `SessionAggregator.swift` 中对非 Optional `promptCount` 的 `?? 0`。
3. 修复后重新运行 `swiftc -typecheck ...`。
4. 若正式打包依赖 Xcode project，应补充可复现的 macOS 构建入口或构建说明。

### P1：shared golden fixture 不是合法 JSON

涉及文件：

- `shared/fixtures/expected_daily_summary.json:10`
- `shared/fixtures/expected_daily_summary.json:11`
- `shared/fixtures/expected_daily_summary.json:12`

问题说明：

当前文件片段：

```json
"deduped_active_seconds": 7920,
"_deduped_note": "All 6 fixture sessions have non-overlapping time ranges, so deduped equals gross. When real overlapping sessions exist (e.g. macOS app + browser web simultaneously), deduped will be lower than gross."
"app_active_seconds": 7020,
```

`_deduped_note` 后缺少逗号，导致整个 JSON 文件无法解析。

验证命令：

```bash
for f in shared/fixtures/*.json shared/schemas/*.json browser-extension/manifest.json; do
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f" || echo "INVALID $f"
done
```

结果：

```text
INVALID shared/fixtures/expected_daily_summary.json
```

影响：

任何依赖 shared fixtures 的测试、schema 校验、聚合 golden test、文档样例解析都会失败。

建议修复：

1. 在 `_deduped_note` 行尾补逗号。
2. 或移除 `_deduped_note`，将说明写入 Markdown 文档，不放入 JSON fixture。
3. 增加一个 lightweight JSON parse check 到发布前校验脚本。

### P1：macOS 导入浏览器 session 时丢失浏览器侧 status

涉及文件：

- `browser-extension/src/background/native-messaging.js:117`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift:45`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift:159`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift:160`

问题说明：

浏览器发送 Native Messaging payload 时包含：

```js
status: session.status
```

macOS 侧 `BrowserSessionPayload` 也声明了：

```swift
let status: String?
```

但构造 `DetectedSession` 时没有使用 payload status，而是重新用 confidence 计算：

```swift
status: confidenceMeetsThreshold(payload.confidence) ? .pending : .suspected
```

这会导致浏览器侧已完成的 session 被导入为 pending。例如用户在扩展里完成 entry 后，浏览器将 session 设为 `completed`，但 macOS 收到后会根据 confidence 重新改成 `pending`。

影响：

1. macOS 待补全池会出现已经完成的浏览器 session。
2. completion rate 失真。
3. 浏览器端 status 语义与 macOS 端不一致。
4. 后续如果浏览器同步 `ignored` / `merged` 状态，也会被错误改写。

建议修复：

1. macOS Native Messaging 导入时优先解析 `payload.status`。
2. 只有 payload status 缺失或非法时，才 fallback 到 confidence 规则。
3. 为 `pending/completed/suspected/ignored/merged` 都补导入测试。

### P1：统一 deduped 聚合口径仍未接入主要 UI

涉及文件：

- `macos/Murmur/Aggregation/SessionAggregator.swift:6`
- `macos/Murmur/ViewModels/TodayViewModel.swift:46`
- `macos/Murmur/ViewModels/TodayViewModel.swift:48`
- `macos/Murmur/ViewModels/StatsViewModel.swift:40`
- `macos/Murmur/ViewModels/StatsViewModel.swift:43`
- `android/app/src/main/java/com/murmur/app/domain/aggregation/SessionAggregator.kt:13`
- `android/app/src/main/java/com/murmur/app/ui/today/TodayViewModel.kt:101`
- `android/app/src/main/java/com/murmur/app/ui/today/TodayViewModel.kt:105`
- `android/app/src/main/java/com/murmur/app/ui/stats/StatsViewModel.kt:103`
- `android/app/src/main/java/com/murmur/app/ui/stats/StatsViewModel.kt:104`

问题说明：

macOS 和 Android 均新增了 `SessionAggregator`，但主要 Today / Stats 视图仍在直接统计原始 session。

macOS Today：

```swift
detectedSessionCount = todaySessions.count
let totalActive = todaySessions.reduce(0) { $0 + $1.activeSeconds }
```

macOS Stats：

```swift
let totalActive = daySessions.reduce(0) { $0 + $1.activeSeconds }
```

Android Today：

```kotlin
val totalActiveSeconds = sessions.sumOf { it.activeSeconds }
val sessionCount = sessions.size
```

Android Stats：

```kotlin
totalActiveSeconds = sessions.sumOf { s -> s.activeSeconds }
```

这些路径没有使用统一的：

- ignored / merged 过滤规则
- gross active seconds
- deduped active seconds
- app / web breakdown
- completion rate 口径

影响：

即使浏览器和 APP 数据都入库，UI 仍可能双算重叠时间，也可能把 ignored / merged session 计入核心指标。这与技术方案中「合理累加」的目标不一致。

建议修复：

1. macOS Today / Stats 改为调用 `SessionAggregator.buildDailySummary(...)`。
2. Android Today / Stats 改为调用 `SessionAggregator` 的统一口径。
3. 主展示建议使用 deduped active seconds，辅助展示 gross active seconds。
4. 趋势图、日报、疲劳分如仍使用 raw activeSeconds，需要明确是否为产品设计，否则应统一改口径。

### P2：浏览器相邻合并后，同步对象仍不是最终保留 session

涉及文件：

- `browser-extension/src/background/sessionizer.js:365`
- `browser-extension/src/background/sessionizer.js:378`
- `browser-extension/src/background/sessionizer.js:381`
- `browser-extension/src/background/sessionizer.js:382`
- `browser-extension/src/background/sessionizer.js:321`
- `browser-extension/src/background/sessionizer.js:322`
- `browser-extension/src/background/sessionizer.js:323`

问题说明：

`checkAndMergeAdjacent(session)` 中，当新 session 与上一条同工具 session 相邻时，会更新上一条 session：

```js
lastSession.endedAt = session.endedAt;
lastSession.activeSeconds = lastSession.activeSeconds + session.activeSeconds;
session.status = SessionStatus.MERGED;
await updateSession(lastSession.id, ...)
```

但 `endSession()` 随后仍然：

```js
await saveSession({ ...state.session });
await enqueueForSync(state.session);
```

此时 `state.session` 是被标记为 `MERGED` 的新 session，而不是被扩展后的 `lastSession`。

影响：

1. sync queue 中可能入队的是 merged child，而不是最终保留的 merged target。
2. macOS 端可能收不到更新后的总时长。
3. 跨端 dedup/upsert 难以保持幂等。

建议修复：

1. `checkAndMergeAdjacent()` 应返回合并结果，例如 `{ retainedSession, mergedSession }`。
2. `endSession()` 应入队 retained session。
3. merged child 应设置 `mergedIntoSessionId = lastSession.id`。
4. retained session 的 `sourceFingerprint`、`promptCount`、`syncStatus` 应同步更新。

## 已确认有推进的修复点

以下修复方向与修复报告基本一致，当前代码已经能看到对应改动：

### Android 夜间检测不再直接跳过

文件：

- `android/app/src/main/java/com/murmur/app/worker/DetectionWorker.kt:54`

当前已移除原先夜间直接 return 的逻辑，并保留说明：

```kotlin
// Night hours are still detected and recorded (sessions tagged with isNight).
```

### Android merge gap 不再计入 activeSeconds

文件：

- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:245`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:247`

当前合并时只做：

```kotlin
current.activeSeconds + next.activeSeconds
```

不再加入 gap 秒数。

### Android 缺失 background 时用下一个 foreground 截断

文件：

- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:204`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:207`

当前遇到新的 foreground 时，会构造 synthetic background event 关闭上一段 session。

### Browser Extension finalized session 已增加入队逻辑

文件：

- `browser-extension/src/background/sessionizer.js:250`
- `browser-extension/src/background/sessionizer.js:323`
- `browser-extension/src/background/sessionizer.js:349`

当前新增 `enqueueForSync()`，并在 `endSession()` / `quickEndSession()` 中调用。

仍需注意：

- merged session 入队对象仍有问题。
- `handleSuspectedAbandon()` 使用 `.then()` 后立即删除 active state，虽然可运行，但错误处理较弱。

### Browser Extension 多 active session recovery 已有 map 存储

文件：

- `browser-extension/src/shared/storage.js:13`
- `browser-extension/src/shared/storage.js:388`
- `browser-extension/src/background/sessionizer.js:525`

当前已新增 `murmur_active_sessions_by_key` 和 `saveActiveSessionsMap()` / `getActiveSessionsMap()`。

## 验证记录

### Browser Extension build

命令：

```bash
npm --prefix browser-extension run build
```

结果：

```text
[Murmur Build] ✓ Build complete. Output: dist/
```

结论：

浏览器扩展基础构建通过。

注意：

当前 build script 只做基础 manifest 校验，没有检查 `connectNative()` 与 `"nativeMessaging"` 权限的一致性，因此 build 通过不代表 Native Messaging 可用。

### JSON parse check

命令：

```bash
for f in shared/fixtures/*.json shared/schemas/*.json browser-extension/manifest.json; do
  node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f" || echo "INVALID $f"
done
```

结果：

```text
INVALID shared/fixtures/expected_daily_summary.json
```

结论：

shared fixture 当前存在语法错误。

### macOS Swift typecheck

命令：

```bash
swiftc -typecheck $(find macos/Murmur -name '*.swift' | sort)
```

结果：

```text
error: cannot find 'NSWorkspace' in scope
```

结论：

macOS Swift 静态类型检查未通过。

### Android build

未执行。

原因：

- 仓库内未发现 `android/gradlew`。
- 本机环境未发现 `gradle`。

### macOS 完整构建

未执行。

原因：

- 仓库内未发现 `.xcodeproj`。
- 仓库内未发现 `.xcworkspace`。
- 仓库内未发现 `Package.swift`。

## 发布判断

当前状态：**不通过 release readiness**。

不建议进入：

- Chrome 扩展打包发布
- macOS 打包
- Android 打包
- 灰度发布

至少需要先完成所有 P1 项，并重新执行以下验证：

1. `npm --prefix browser-extension run build`
2. JSON parse check
3. macOS Swift typecheck 或正式 Xcode build
4. Android Gradle build
5. Native Messaging 端到端手动验收
6. 一组跨端聚合 golden test

## 建议修复顺序

1. 修复 `shared/fixtures/expected_daily_summary.json` 的 JSON 语法错误。
2. 修复 `WindowTitleDetector.swift` 缺少 `AppKit` 导入的问题，并清理 macOS warning。
3. 扩展 manifest 增加 `"nativeMessaging"` 权限。
4. macOS 设置页接入 `ManifestInstaller`，完成真实 extension id 与 host path 写入。
5. 明确并打包 native host/helper 可执行文件。
6. Native Messaging 导入时保留浏览器传来的 `status`。
7. Today / Stats 接入统一 `SessionAggregator`，明确主指标使用 deduped active seconds。
8. 修复浏览器相邻合并后的 retained session 入队问题。
9. 为 shared fixture、聚合器、Native Messaging、Android Sessionizer 补自动化测试。

## 最终结论

修复报告中的 8 个修复点并未完全消除发布风险。当前代码仍存在多个直接影响构建、数据同步和统计准确性的阻断问题。

本轮二次审查结论为：

**暂缓打包发布，继续修复后再进行下一轮 release readiness 审查。**
