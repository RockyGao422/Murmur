# Codex 代码审查报告

日期：2026-05-05
审查范围：跨端 AI 使用统计与合理累加升级（全仓改动）

## 审查结论

改动引入了 Android 迁移/构建失败、浏览器会话恢复/计费 Bug、以及 macOS 数据兼容性/构建问题。这些问题对于现有用户和正常运行时流程是阻塞性的。

---

## 问题清单

### [P1] Android Room 迁移后保留了已删除的 package_name 列

**文件**：`android/app/.../AppDatabase.kt:56`

从 DB v1 升级时，迁移脚本将 `package_name` 复制到 `raw_package_name`，但保留旧的 `package_name` 列在表中，而 `DetectedSessionEntity` 不再声明该列。Room 会校验迁移后的表结构与 Entity 是否匹配，因此现有安装从 v1 迁移到 v2 后将无法打开数据库。

### [P1] TodayStats 新字段未出现在 SQL 查询中

**文件**：`android/app/.../DetectedSessionDao.kt:85-86`

`getTodayStats()` 查询结果中仅有 `sessionCount`、`totalActiveSeconds`、`pendingCount`、`completedCount`，但 `TodayStats` 新增了 `suspectedCount` 和 `promptCount` 两个非空字段。Room 要求这些字段在游标中存在，否则 Android 编译失败。

### [P1] 浏览器活跃会话持久化形状与服务恢复不匹配

**文件**：`browser-extension/src/background/sessionizer.js:148`

MV3 Service Worker 重启时，`initSessionizer()` 从 `murmur_active_session` 读取数据，期望是顶层 `DetectedSession`（访问 `stored.startedAt`、`stored.endedAt`）。但新的 `saveActiveSession` 存储的是 `{ key, session, isActive, ... }` 包装对象，导致恢复时从 undefined 字段计算，保存损坏/NaN 的会话。

### [P2] 同一标签页在不同 AI 工具间导航时不结束旧会话

**文件**：`browser-extension/src/background/sessionizer.js:386-390`

当单个活跃标签页从一个 AI 站点导航到另一个时，`activeSessions.has(eventKey)` 已为 true，因此该分支仅恢复旧状态，不会比较已有会话的 tool/domain 与新的 `match.tool`。导航后的时间会被归入前一个工具，且不会为新 AI 工具创建会话。

### [P2] 窗口焦点恢复后不重新激活会话计时

**文件**：`browser-extension/src/background/sessionizer.js:417`

窗口失焦后 `pauseSession` 将 `isActive` 设为 false 并清空 `lastActiveStartedAt`；焦点恢复时调用 `resumeSession`，该函数仅清除 abandon timer 和更新时间戳，不会调用 `activateSession`。因此在重新获得焦点的 AI 标签页中的时间不会被累积，会话会被低估或丢弃。

### [P1] macOS DetectedSession 新增非可选字段导致旧数据解码失败

**文件**：`macos/Murmur/Models/DetectedSession.swift:27-31`

对于在新的 `deviceId`、`syncStatus` 等字段加入前已有的 `detected_sessions.json`，Swift 生成的 `Decodable` 将这些新字段视为必需。`StorageManager.loadSessions()` 将捕获 `keyNotFound` 并返回 `[]`，后续的 append/upsert 会覆盖文件，用户之前的所有会话数据将丢失。

### [P1] DailySummary 新增必需字段导致现有初始化调用点编译失败

**文件**：`macos/Murmur/Models/DailySummary.swift:12-17`

新增的必需存储属性改变了合成的 memberwise initializer，但现有调用点（如 `StatsViewModel`）在构造 `DailySummary` 时未传入 `grossActiveSeconds`、`dedupedActiveSeconds`、`promptCount`、`completionRate`。macOS 目标将无法编译。
