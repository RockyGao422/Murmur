# 跨平台 AI 使用统计审查修复总结

日期：2026-05-05
基于：`docs/CODE_REVIEW_CROSS_PLATFORM_AGGREGATION_REPORT_2026-05-05_CODEX.md`

## 审查概况

审查发现 9 个问题（4 个 P1、4 个 P2、1 个 P3）。其中 8 个已修复，1 个判定为延后（P3 级别且与原始技术方案 P1 阶段规划一致）。

---

## 已修复问题

### P1-1：macOS 编译问题

**问题**：`DetectedSession` 自定义 `init(from decoder:)` 移除了合成的 memberwise init，导致 `Sessionizer`、`NativeMessagingHost` 等构造调用无法编译。`StorageManager` 缺少 `shared` 单例。`DailySummary` 构造缺少 `detectedActiveSeconds` 参数。

**修复**：
- `DetectedSession.swift`：添加显式 memberwise initializer，所有新增字段均有默认值
- `StorageManager.swift`：添加 `static let shared = StorageManager()`
- `SessionAggregator.swift`：`buildDailySummary()` 补传 `detectedActiveSeconds`

### P1-2：Native Messaging handshake 不可用

**问题**：macOS `NativeMessagingHost` 启动后不发送 `connection_ack`，浏览器 `sendSession()` 等待 200ms 后因未收到 ack 返回失败。

**修复**：
- `NativeMessagingHost.swift`：`readLoop()` 启动立即发送 `type: "connection_ack"` 消息
- `sendResponse()` 改为发送带 `type` 字段的包装 JSON，兼容浏览器侧 `message.type` 检查

### P1-3：浏览器普通 finalized session 未进入同步队列

**问题**：`endSession()`、`quickEndSession()`、`handleSuspectedAbandon()` 只执行 `saveSession()`，不调用 `addToSyncQueue()`。唯一进队列的路径是 `completeAndSaveEntry`，导致普通网页 AI 使用不进入 macOS 汇总。

**修复**：
- `sessionizer.js`：新增 `enqueueForSync()` 辅助函数，在所有 finalized 路径（`endSession`、`quickEndSession`、`handleSuspectedAbandon`）的 `saveSession()` 后统一调用
- 若 `nativeMessagingEnabled` 开启，自动 `addToSyncQueue` 并标记 `syncStatus = pending`

### P1-4：Android 夜间 AI 使用被直接跳过

**问题**：`DetectionWorker` 在当前时间落入夜间时段时直接返回，不查询 UsageEvents、不生成 session。方案要求夜间使用仍然检测记录，只标记 `isNight`。

**修复**：
- `DetectionWorker.kt`：移除夜间跳过逻辑（第 54-61 行及相关 `isInNightHours` 函数）
- Sessionizer 继续在每个 session 上标记 `isNight`，夜间会话正常入库

### P2-1：浏览器 abandon 超时误标 suspected

**问题**：`handleSuspectedAbandon()` 无条件设置 `status = SUSPECTED`，导致正常长会话被误判。

**修复**：
- `handleSuspectedAbandon()`：status 改为依据累计活跃秒数判断：< 30s → SUSPECTED，>= 30s → PENDING（与 `endSession` 规则一致）

### P2-2：Golden fixture 期望值不一致

**问题**：`expected_daily_summary.json` 中 deduped = 5400，但 6 条 fixture session 时间不重叠，deduped 应等于 gross = 7920。

**修复**：
- 修正 `deduped_active_seconds` 为 7920，添加注释说明不重叠场景下 deduped = gross

### P2-3：Android Sessionizer 过度计时

**问题**：`mergeNearbySessions()` 将两个 session 之间的 gap 秒数加入 `activeSeconds`。缺失 background 事件时，duration 用 `System.currentTimeMillis` 计算，导致长时间高估。

**修复**：
- `mergeNearbySessions()`：合并时只取 `current.activeSeconds + next.activeSeconds`，不加入 gap
- `pairEvents()`：新 foreground 到达时，用新 foreground 的 timestamp 作为合成 background event 关闭旧 session，避免无界计时

### P2-4：浏览器多 session recovery 只保存一条

**问题**：`flushAll()` 反复调用 `saveActiveSession()` 覆盖同一个 key。多 tab 场景下 service worker 重启只能恢复最后写入的 active session。

**修复**：
- `storage.js`：新增 `murmur_active_sessions_by_key` key + `saveActiveSessionsMap()` / `getActiveSessionsMap()` 函数
- `sessionizer.js`：`flushAll()` 改为构建完整 sessionsByKey map，一次性写入
- `initSessionizer()`：优先从 map 恢复所有 active sessions，兼容回退到旧格式单 session key

---

## 延后处理

### P3：Prompt counter content script 未接入

**判定**：**延后，与原始技术方案一致。**

**原因**：Prompt count 功能在原始技术方案（`CROSS_PLATFORM_AI_USAGE_AGGREGATION_PLAN.md` 第 8.5 节）中明确标注为 **P1 功能**，默认关闭。当前 `prompt-counter.js` 内容脚本和 service worker 的 `reportPrompt` 处理逻辑已实现但未接入 manifest 或动态注入，这与 MVP（P0）阶段的产品决策一致——prompt_count 在 MVP 中不被采集，`prompt_count` 字段在 App 会话中为 null，在网页会话中仅当用户主动开启后才计数。

**后续计划**：P1 阶段完成 manifest content_scripts 注册（限定 AI 站点 host patterns）或通过 `chrome.scripting` API 动态注入。

---

## 验证结果

- 浏览器扩展构建：通过（`npm run build`）
- Android 构建：未执行（仓库缺少 `gradlew`，本机无 gradle 环境）
- macOS 构建：未执行（仓库无 `.xcodeproj` / `Package.swift`）
- 静态分析：已执行，macOS 编译级问题已修复
