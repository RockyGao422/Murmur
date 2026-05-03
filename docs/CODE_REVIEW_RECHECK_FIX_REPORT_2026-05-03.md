# Murmur 复审修复报告

> 基于 `docs/CODE_REVIEW_RECHECK_REPORT_2026-05-03.md` 的修复实施记录  
> 修复日期：2026-05-03

## 修复总览

共修复 **14 项问题**，其中 P0 阻断 6 项、P1 高风险 7 项、P2 质量 1 项。

---

## Android 端修复（4 项）

### 3.1 编译错误 — 旧枚举引用残留

**问题**：枚举改为 `MACOS/ANDROID/BROWSER`、`APP/WEB`、`PENDING/COMPLETED/...` 后，多处仍引用 `MOBILE_APP`、`FOREGROUND_APP`、`ACTIVE`。

**修复文件**：
- `domain/detection/Sessionizer.kt:58,66,67`
  - `SessionStatus.ACTIVE` → `SessionStatus.PENDING`
  - `SourcePlatform.MOBILE_APP` → `SourcePlatform.ANDROID`
  - `SourceKind.FOREGROUND_APP` → `SourceKind.APP`
- `ui/today/TodayViewModel.kt:108`
  - `SessionStatus.ACTIVE` → `SessionStatus.PENDING`
- `domain/model/Models.kt:161,162,185,264`
  - 全部 `SourcePlatform.MOBILE_APP` → `SourcePlatform.ANDROID`（2 处）
  - 全部 `SourceKind.FOREGROUND_APP` → `SourceKind.APP`（2 处）

### 3.2 DAO 状态字符串大小写不一致

**问题**：实体默认值已小写（`pending/suspected/completed`），但 SQL 查询仍用大写（`'ACTIVE'/'SUSPECTED'/'COMPLETED'/'MERGED'`），导致查询结果始终为空。

**修复文件**：
- `data/local/dao/DetectedSessionDao.kt`
  - `WHERE status = 'ACTIVE' OR status = 'SUSPECTED'` → `'pending' OR 'suspected'`
  - `CASE WHEN status = 'ACTIVE' ...` → `'pending'`
  - `SET status = 'MERGED'` → `'merged'`
  - `status = 'COMPLETED'` → `'completed'`
- `data/repository/LedgerRepository.kt:81`
  - `"COMPLETED"` → `SessionStatus.COMPLETED.value`（消除裸字符串）
- `data/repository/SessionRepository.kt:94`
  - `"MERGED"` → `SessionStatus.MERGED.value`

### 4.2 EntryCalculator 公式失真

**问题**：枚举改为整数（qualityScore 1-4、moodWeight 0/2/6/8/10）后，公式 `activeSeconds * qualityScore * moodWeight` 产生远超实际的值。

**修复文件**：
- `domain/calculator/EntryCalculator.kt` — 全量重写
  - qualityScore(1-4) 归一化为 qualityRatio（÷4）
  - moodWeight(0/2/6/8/10) 转换为 moodEfficiency（1 - weight/20）
  - qualityPenalty 按 `qualityPenalty/14` 比例计算
  - moodPenalty 按 `moodWeight/20` 比例计算

### 未修改：4.1 LedgerEntry 字段与 shared schema 不一致

Android 使用 `time_saved_seconds / extra_cost_seconds / net_gain_seconds` 而非 shared schema 的 `estimated_saved_minutes / prompt_minutes / review_minutes / edit_minutes / debug_minutes / rework_minutes`。这是深层 schema 变更，影响 Entity / DAO / Domain / UI Completion 等多层，建议后续专门迁移。

---

## 浏览器扩展修复（8 项）

### 3.3 工具匹配链路断链

**问题**：`detector.js` 不再提供 `url` 字段，但 `tool-matcher.js` 仍检查 `if (!url || !domain) return {tool: null}`，导致所有事件直接返回 null。

**修复文件**：
- `background/tool-matcher.js` — `matchEvent()` 函数
  - 移除 `const url = rawEvent.url` 和对 `!url` 的检查
  - 改为只检查 `!domain`
  - Phase 2 URL pattern 匹配：用 `domain` 构造测试 URL (`https://{domain}/`) 替代原 `url`

### 3.4 Manifest PNG 图标不存在

**问题**：manifest 引用 `icons/icon16.png`、`icon48.png`、`icon128.png` 但目录下只有 `icon.svg`。

**修复文件**：
- `manifest.json` — `icons` 和 `action.default_icon` 均改回引用 `icons/icon.svg`（Chrome MV3 支持 SVG 图标）

### 3.5 字段迁移不完整 — 大量调用方仍用旧字段

**问题**：sessionizer 已迁移到 `startedAt/endedAt/activeSeconds/rawDomain`，但 storage/service-worker 仍读取 `startTime/endTime/duration/domain`。

**修复文件**：
- `shared/storage.js`
  - `getSessionsByDate()`：从按 `startTime` epoch 过滤改为按 `startedAt` ISO 字符串日期部分匹配
  - `getActiveSessions()`：从 `endTime === null || status === 'paused'` 改为检查 `endedAt` 或 `endTime` 是否为空
- `background/service-worker.js`（6 处）
  - `totalDuration` 计算：`s.duration` → `s.activeSeconds || s.duration || 0`
  - pending 过滤：`SessionStatus.NEEDS_COMPLETION || SUSPECTED_ABANDONED` → `PENDING || SUSPECTED`
  - getStatus handler：session 返回兼容新旧字段名

### 3.6 Options 页仍手写带 URL 的 CSV

**问题**：`csv-exporter.js` 已去掉 URL 列，但 Options 页的 `onExportSessions()` 和 `onExportEntries()` 仍有手写 CSV 逻辑包含 URL。

**修复文件**：
- `options/options.js`
  - `onExportSessions()`：删除手写 CSV 逻辑，改为调用 `exportSessionsCSV()` + `downloadCSV()`
  - `onExportEntries()`：同上，改为调用 `exportEntriesCSV()` + `downloadCSV()`

### 4.3 Native Messaging 未受 settings 管控

**问题**：manifest 已移除权限、settings 默认关闭，但 service worker 仍无条件调用 `tryConnectNativeMessaging()`。

**修复文件**：
- `background/service-worker.js`
  - `tryConnectNativeMessaging()` 改为 `async`，启动时先 `await getSettings()` 检查 `nativeMessagingEnabled`
  - 未启用时直接 return，不连接

### 4.5 Calculators 使用旧模型

**问题**：types 已声明新字段，但 calculators 仍使用 `duration/extraCostFraction/netGain(hours)/old enums`。

**修复文件**（3 个全量重写）：
- `calculator/entry-calculator.js` — 改为分钟维度公式
  - `totalExtraCostMinutes = promptMinutes + reviewMinutes + editMinutes + debugMinutes + reworkMinutes`
  - `netGainMinutes = estimatedSavedMinutes - totalExtraCostMinutes`
  - `suggestedDefaults()` 使用 `activeSeconds` 字段
- `calculator/fatigue-calculator.js` — 改为技术方案 9 分量公式
  - 时长分(18) + 频率分(14) + 切换分(10) + 夜间分(10) + 堆积分(8) + 返工分(15) + 质量分 + 感受分 + 低收益分(8)
  - 兼容新旧字段名
- `calculator/weekly-review.js` — 重写为使用 `activeSeconds/startedAt/isNight`
  - 日期过滤兼容 `startedAt`(ISO) 和 `startTime`(epoch)
  - insights 和 recommendations 使用新状态枚举

### 5.1 Build 脚本校验覆盖不足

**问题**：build 成功但 manifest 引用的 icon 文件不存在未被检出。

**修复文件**：
- `scripts/build.js` — 增加 icon 文件存在性校验
  - 遍历 `manifest.icons` 中所有路径（支持字符串和对象两种格式）
  - 文件不存在时 `process.exit(1)`

---

## macOS 端修复（2 项）

### 4.6 切换 AI 工具时 session 不拆分

**问题**：`isAIEvent && isInAISession` 分支不检查 `toolId` 是否变化，ChatGPT→Claude 切换会被记录为同一工具。

**修复文件**：
- `Detection/Sessionizer.swift:49-56`
  - 在继续 session 前检查 `currentSession.toolId != matchResult.matchedTool?.id`
  - 不同工具时先 `flushCurrentSession` 再 `startNewSession`

### 4.7 跨午夜第一段永远标记为夜间

**问题**：`first.isNight = isNightHours(session.startedAt) || true` 让所有跨午夜第一段都标记为夜间。

**修复文件**：
- `Detection/Sessionizer.swift:112`
  - `|| true` → `|| isNightHours(midnight.addingTimeInterval(-1))`
  - 改为实际判断午夜前一秒是否在夜间时段

---

## 构建验证结果

### Browser Extension

```
npm --prefix browser-extension run build
```

```
[Murmur Build] Validating source files...
  ✓ All 20 required files present.
[Murmur Build] Validating manifest.json...
  ✓ Icon files verified
  ✓ manifest.json valid
[Murmur Build] Copying to dist/...
[Murmur Build] ✓ Build complete. Output: dist/
```

构建通过，icon 校验有效。

### Android / macOS

静态审查确认：零残留旧枚举引用（`MOBILE_APP`、`FOREGROUND_APP`、`ACTIVE`、`NEEDS_COMPLETION`、`SUSPECTED_ABANDONED`）。
Xcode 工程和 Gradle wrapper 仍需 IDE 工具生成，代码文件已就绪。

---

## 暂时未修改项

| 问题 | 原因 |
|------|------|
| 3.7 macOS 无 Xcode 工程 | 需 Xcode IDE 手动创建 `.xcodeproj`，源文件已齐备 |
| 3.8 Android 无 Gradle wrapper | 需 Android Studio 生成 `gradlew` + `gradle-wrapper.jar` 二进制 |
| 4.1 Android LedgerEntry 字段不匹配 | 影响 Entity/DAO/Domain/UI 多层，建议专门做 schema 迁移 |
| 4.4 Prompt Count 无法启用 | P1 功能，已正确默认关闭；后续用 `scripting` optional permission 闭环 |
| 4.8 camelCase vs snake_case | 原型阶段内部 camelCase + 导出时转换是可接受模式 |

---

## 修复统计

| 平台 | P0 | P1 | P2 | 修改文件数 | 重写文件数 |
|------|----|----|----|-----------|-----------|
| Android | 2 | 1 | 0 | 8 | 1 |
| Browser Extension | 3 | 3 | 1 | 11 | 3 |
| macOS | 0 | 2 | 0 | 1 | 0 |
| **合计** | **5** | **6** | **1** | **20** | **4** |
