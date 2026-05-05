# 跨平台 AI 使用统计实现代码审查报告

审查日期：2026-05-05  
审查人：Codex  
审查范围：

- `docs/CROSS_PLATFORM_AI_USAGE_AGGREGATION_PLAN.md`
- `docs/CODE_REVIEW_REPORT_2026-05-05_CODEX.md`
- `docs/CODE_REVIEW_FIX_REPORT_2026-05-05_CODEX.md`
- 当前 macOS / Android / Browser Extension / shared 代码实现

## 总体结论

当前实现还没有达到技术方案要求的「APP 统计 AI 应用使用、浏览器插件统计网页使用、再统一去重累加」的可发布闭环。

主要阻断点有四类：

1. macOS 侧存在编译级问题。
2. Browser Extension 与 macOS Native Messaging 链路实际不可用。
3. 浏览器普通 finalized session 没有进入同步队列。
4. Android 夜间使用会被直接跳过，且统一聚合口径尚未接入主要 UI。

## 审查发现

### P1：macOS 当前存在编译级问题

文件：

- `macos/Murmur/Models/DetectedSession.swift:68`
- `macos/Murmur/Detection/Sessionizer.swift:228`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift:132`
- `macos/Murmur/NativeMessaging/ImportQueueService.swift:94`
- `macos/Murmur/Storage/StorageManager.swift:3`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift:9`
- `macos/Murmur/NativeMessaging/ImportQueueService.swift:13`
- `macos/Murmur/Models/DailySummary.swift:88`
- `macos/Murmur/Aggregation/SessionAggregator.swift:129`

问题：

`DetectedSession` 在类型内部新增了自定义 `init(from:)`。Swift 中，结构体一旦在类型内部定义自定义 initializer，就不会继续合成 memberwise initializer。但当前多处代码仍在调用 `DetectedSession(...)` 构造完整对象。

同时，`NativeMessagingHost`、`ImportQueueService`、`NotificationManager`、`MarkdownExporter` 等代码使用 `StorageManager.shared`，但 `StorageManager` 当前只定义了普通 `init()`，没有 `static let shared`。

此外，`DailySummary` 的显式 initializer 要求传入 `detectedActiveSeconds`，但 `SessionAggregator.buildDailySummary()` 构造 `DailySummary` 时没有传该参数。

影响：

macOS target 无法稳定编译，也就无法验证 Native Messaging、导入队列、聚合器与 UI 的实际行为。

建议修复：

1. 为 `DetectedSession` 补齐显式完整 initializer，或将自定义 `Decodable` initializer 移到 extension 中并确认 memberwise initializer 仍可用。
2. 统一 `StorageManager` 的生命周期策略：要么补 `static let shared`，要么改为依赖注入，不要混用。
3. `SessionAggregator.buildDailySummary()` 构造 `DailySummary` 时补 `detectedActiveSeconds`，或为该参数提供兼容默认值。

### P1：Native Messaging 链路实际不可用

文件：

- `browser-extension/src/background/native-messaging.js:69`
- `browser-extension/src/background/native-messaging.js:83`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift:93`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift:119`
- `macos/Murmur/ViewModels/SettingsViewModel.swift:162`

问题：

浏览器侧 `sendSession()` 会先建立 native port，然后等待 `connection_ack`。如果 200ms 内没有收到 ack，会返回 `Connection not established`，不会发送 session。

macOS 侧 `NativeMessagingHost` 只在收到 session 消息后返回 `ok/error`，没有在连接建立时主动发送 `connection_ack`。因此浏览器侧第一次发送前就会失败。

另一个结构性问题是，设置页启用 Native Messaging 时只是调用 `NativeMessagingHost.shared.start()`，等于在主 App 进程里读取标准输入；这不是 Chrome Native Messaging 的实际启动方式。当前代码也没有把 `ManifestInstaller`、真实 extension id、helper host、import queue 完整串起来。

影响：

即使用户打开了 Native Messaging 开关，浏览器会话也无法可靠进入 macOS 存储。

建议修复：

1. 明确 handshake 协议：要么 macOS host 启动后立即发送 `connection_ack`，要么浏览器侧不要在发送 session 前强依赖 ack。
2. macOS 设置页启用时应安装/更新 native messaging manifest，并写入真实 extension id。
3. Native Messaging host 建议独立为 helper 可执行文件，由 Chrome 启动；主 App 负责配置、导入队列扫描、状态展示。
4. 浏览器侧同步失败后必须进入 retry queue，并在状态上体现 `pending/failed/synced`。

### P1：浏览器普通 finalized session 没有进入同步队列

文件：

- `browser-extension/src/background/sessionizer.js:223`
- `browser-extension/src/background/sessionizer.js:255`
- `browser-extension/src/background/sessionizer.js:283`
- `browser-extension/src/background/sessionizer.js:284`
- `browser-extension/src/background/service-worker.js:549`

问题：

`endSession()` 正常结束会话后只执行：

- `checkAndMergeAdjacent(state.session)`
- `saveSession({ ...state.session })`

它没有调用 `addToSyncQueue()`，也没有将 session 标记为 `sync_status = pending`。

当前唯一会把 session 加入同步队列的路径，是用户在插件里完成 entry 后的 `completeAndSaveEntry` 分支。这意味着普通 ChatGPT / Claude / Gemini 网页使用虽然会被插件检测并保存到插件本地，但不会进入 macOS 侧汇总。

影响：

技术方案中的「插件统计网页使用，然后和 APP 数据合理累加」无法成立，macOS 总账会漏掉大部分浏览器网页 AI 使用。

建议修复：

1. 所有 finalized browser sessions，包括 `pending`、`suspected`、`completed`，都应根据配置进入同步队列。
2. `endSession()`、`quickEndSession()`、`handleSuspectedAbandon()` 应统一走 finalize 后处理函数。
3. merge 后要明确同步的是被保留 session，还是 merged session 状态也需要上报。

### P1：Android 夜间 AI 使用会被直接丢弃

文件：

- `android/app/src/main/java/com/murmur/app/worker/DetectionWorker.kt:54`
- `android/app/src/main/java/com/murmur/app/worker/DetectionWorker.kt:58`

问题：

`DetectionWorker` 在当前时间落入夜间时间段时直接返回，不查询 UsageEvents，也不生成 session。

这与技术方案中的口径不一致。方案要求夜间使用仍然被检测和记录，只是标记 `is_night`，再由聚合、展示、疲劳分或提醒策略决定如何使用该字段。

影响：

夜间 AI APP 使用数据会永久丢失，无法进入日报、趋势、疲劳分、跨端累加和后续复盘。

建议修复：

1. 移除 worker 顶层夜间跳过逻辑。
2. 保留每个 session 的 `isNight` 标记。
3. 如果用户选择夜间不打扰，应只影响通知或提醒，不应影响检测入库。

### P2：浏览器暂停超时会把正常长会话误标为 suspected

文件：

- `browser-extension/src/background/sessionizer.js:223`
- `browser-extension/src/background/sessionizer.js:240`
- `browser-extension/src/background/sessionizer.js:242`

问题：

`handleSuspectedAbandon()` 在 session 暂停超时后，只要累计活跃秒数超过最小阈值，就无条件设置：

```js
state.session.status = SessionStatus.SUSPECTED;
```

这会把正常的长 ChatGPT/Claude 使用场景误判为疑似会话，例如切到其他窗口、等待长回答、临时离开、锁屏恢复等。

影响：

待确认池会被噪音污染，completion rate、pending count、suspected count、疲劳分和日报统计都会偏离真实情况。

建议修复：

1. abandon 只表示「会话结束原因」，不应直接等同于 `suspected`。
2. status 应继续依据活跃时长、匹配置信度、工具识别结果、prompt count 等规则计算。
3. 可以新增 `endReason = abandoned/blur/navigation/idle_timeout`，避免复用 status 表达过多语义。

### P2：统一聚合器没有接入主要 UI，且 golden fixture 期望值不一致

文件：

- `shared/fixtures/expected_daily_summary.json:9`
- `shared/fixtures/expected_daily_summary.json:10`
- `macos/Murmur/ViewModels/TodayViewModel.swift:46`
- `macos/Murmur/ViewModels/TodayViewModel.swift:48`
- `android/app/src/main/java/com/murmur/app/ui/today/TodayViewModel.kt:101`
- `android/app/src/main/java/com/murmur/app/ui/today/TodayViewModel.kt:105`
- `android/app/src/main/java/com/murmur/app/domain/aggregation/SessionAggregator.kt:13`
- `macos/Murmur/Aggregation/SessionAggregator.swift:6`

问题：

macOS 和 Android 都新增了 `SessionAggregator`，但主要 Today/Stats UI 仍直接对 session 做 `count` 和 `sum(activeSeconds)`，没有使用统一的 gross/deduped 口径，也没有统一排除 ignored/merged session。

同时，`shared/fixtures/expected_daily_summary.json` 中写的是：

```json
"gross_active_seconds": 7920,
"deduped_active_seconds": 5400
```

但当前 `shared/fixtures/detected_sessions.json` 中 6 条 session 时间段互不重叠，按 union interval 计算，deduped active seconds 应与 gross active seconds 相同，都是 `7920`。

影响：

1. UI 继续展示旧口径，新增聚合器无法真正影响用户看到的数据。
2. golden fixture 会让自动化测试要么失败，要么固化错误业务规则。
3. 跨 APP / 网页累加时无法保证和技术方案一致。

建议修复：

1. Today/Stats/DailySummary 全部改为调用统一 `SessionAggregator.buildDailySummary()`。
2. 明确 UI 主指标使用 deduped active seconds，辅助展示 gross active seconds。
3. 修正 fixture：如果要测试去重，应增加真实重叠 session；如果当前 fixture 不重叠，则 `deduped_active_seconds` 应为 `7920`。

### P2：Android Sessionizer 存在过度计时风险

文件：

- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:103`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:196`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:205`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:227`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt:240`

问题一：

`mergeNearbySessions()` 合并相邻 session 时，把两个 session 之间的 gap 秒数也加入了 `activeSeconds`：

```kotlin
current.activeSeconds + next.activeSeconds + ((next.startedAt - current.endedAt) / 1000)
```

技术方案中的同源邻近合并是为了减少碎片，不应把用户没有实际处于目标 APP 的间隔计为活跃时间。

问题二：

`pairEvents()` 遇到新的 foreground 时，如果之前有未关闭 foreground，会生成 `RawSession(pendingForeground, null)`。随后 duration 会按 `System.currentTimeMillis() - foreground.timestamp` 计算，而不是用下一个 foreground 的 timestamp 截断。

影响：

Android APP 使用时长可能被明显高估，尤其是频繁切换 APP 或 UsageEvents 缺失 background 事件时。

建议修复：

1. 合并相邻 session 时，`activeSeconds` 只应取两个活跃片段之和。
2. 缺失 background 时，如果后续出现另一个 foreground，应以前一个 session 的结束时间等于下一个 foreground 时间。
3. 为「缺失 background」「相邻合并」「跨午夜拆分」补充单元测试。

### P2：浏览器 service worker 恢复只能保存一个 active session

文件：

- `browser-extension/src/shared/storage.js:6`
- `browser-extension/src/shared/storage.js:12`
- `browser-extension/src/shared/storage.js:323`
- `browser-extension/src/background/sessionizer.js:485`
- `browser-extension/src/background/sessionizer.js:496`

问题：

storage 中只有单个 `murmur_active_session` key。`flushAll()` 遍历多个 active sessions 时，会反复调用 `saveActiveSession({ key, ...state })` 覆盖同一个 key。

影响：

如果用户同时打开多个 AI 网站标签页，service worker 挂起或浏览器重启后，只能恢复最后一次写入的 active session，其余会话会丢失或被截断。

建议修复：

1. 将 active session recovery 存储改为 map：`murmur_active_sessions_by_key`。
2. 恢复时按 key 重建 `activeSessions`。
3. `saveActiveSession(null)` 不应在结束某一个 key 时清空所有 active session 状态。

### P3：prompt count 采集脚本未接入

文件：

- `browser-extension/manifest.json:7`
- `browser-extension/manifest.json:34`
- `browser-extension/src/content/prompt-counter.js`

问题：

项目中存在 `prompt-counter.js`，service worker 也有 prompt 上报处理逻辑，但 manifest 没有声明 `content_scripts`，也没有 `scripting` 权限；代码中也未发现 `chrome.scripting.executeScript` 动态注入。

影响：

`prompt_count` 字段大概率始终无法从页面采集，日报中的 prompt 统计不可用。

建议修复：

1. 在 manifest 中注册 content script，限定 AI 站点 host patterns。
2. 或增加 `scripting` 权限，通过 service worker 在匹配站点动态注入。
3. 对主流 AI 站点分别做 selector 兼容与降级策略。

## 已确认的修复点

以下内容与 `docs/CODE_REVIEW_FIX_REPORT_2026-05-05_CODEX.md` 中描述基本一致，当前代码看起来已经有所修复：

- Android Room legacy `package_name` 字段仍保留，降低升级破坏风险。
- Android DAO 聚合字段已补充 `suspectedCount`、`promptCount`。
- shared schema 已补充跨端同步相关字段。

但这些修复尚未消除本报告中列出的 P1/P2 阻断问题。

## 验证情况

已执行：

```bash
npm --prefix browser-extension run build
```

结果：

- Browser Extension 构建通过。
- manifest 基础校验通过。
- dist 文件生成成功。

未能执行：

```bash
gradle build
```

原因：

- 当前仓库未发现 `android/gradlew`。
- 本机环境没有 `gradle` 命令。

未能执行 macOS 完整构建。

原因：

- 当前仓库未发现 `.xcodeproj`、`.xcworkspace` 或 `Package.swift`。
- 但静态审查已经发现 macOS 编译级问题。

环境确认：

```bash
swift --version
```

本机存在 Swift 6.3.1，但缺少可直接构建的 macOS 工程入口。

## 建议修复顺序

1. 先修复 macOS 编译问题：`DetectedSession` initializer、`StorageManager.shared`、`DailySummary` 构造参数。
2. 修复 Native Messaging handshake，并完成 manifest/helper/import queue 的真实接入。
3. 浏览器所有 finalized session 统一进入同步队列，而不是只在用户完成 entry 后同步。
4. Android 移除夜间跳过检测逻辑，改为记录 `isNight`。
5. macOS/Android Today、Stats、DailySummary 全部接入统一 `SessionAggregator`。
6. 修正 shared golden fixture，并补充跨端聚合单元测试。
7. 修复 Android gap 过度计时和缺失 background 的截断规则。
8. 浏览器 active session recovery 改为多 session map。
9. 接入 prompt counter content script 或动态注入机制。

## 发布判断

当前不建议进入发布或灰度。

建议至少完成所有 P1 项，并为跨端 session 同步、去重聚合、Android 夜间检测、浏览器 finalized session 入队补齐自动化测试后，再进入下一轮 release readiness 审查。
