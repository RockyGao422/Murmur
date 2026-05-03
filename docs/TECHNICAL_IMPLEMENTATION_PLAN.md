# Murmur 自动检测版技术实现方案

本文档基于新版 [PRD](../README.md) 编写。新版 Murmur 只适配 **macOS、Android、浏览器扩展**，iOS 暂不支持。核心能力从「用户手动记录」调整为 **自动检测 AI 使用会话，再由用户轻量补全为省力账本记录**。

本方案只描述技术实现，不包含代码变更。

## 1. 技术结论

MVP 推荐采用三端并行、数据本地优先的架构：

| 平台 | 角色 | 技术栈 | 自动检测方式 |
| --- | --- | --- | --- |
| macOS App | 主仪表盘和桌面自动检测 | Swift / SwiftUI / AppKit / SQLite | `NSWorkspace` 前台 App 检测，可选 Accessibility 窗口标题识别 |
| Android App | 移动 AI App 自动检测 | Kotlin / Jetpack Compose / Room / WorkManager | `UsageStatsManager` 查询 App 前台使用事件 |
| Browser Extension | 网页 AI 自动检测 | TypeScript / Manifest V3 / IndexedDB 或 storage.local | `tabs`、`webNavigation`、`windows`、`idle` API 检测 AI 网站会话 |

本版不做：

- iOS App。
- 服务器。
- 账号系统。
- 云同步。
- 第三方分析 SDK。
- prompt 内容采集。
- AI 输出内容采集。
- 截屏、录屏、键盘监听。

核心技术闭环：

```text
平台检测器 Detector
→ 原始事件 Raw Event
→ 工具匹配 Tool Matcher
→ 会话切分 Sessionizer
→ Detected Session
→ 用户补全 Completion
→ Ledger Entry
→ 指标计算 Calculator
→ 今日 / 统计 / 周报
```

## 2. 关键产品变化对技术的影响

### 2.1 从 Entry-first 到 Session-first

旧方案中，用户主动创建 `Entry`。  
新方案中，系统先自动创建 `DetectedSession`。

技术影响：

- 数据模型必须拆分 `detected_sessions` 和 `ledger_entries`。
- 今日页要同时展示「自动检测指标」和「已补全收益指标」。
- 疲劳指数需要同时消费自动检测数据和用户补全数据。
- 周报必须标注样本质量，例如「检测到 42 次，已补全 18 次」。

### 2.2 自动检测不能等于自动判断收益

自动检测可以可靠得到：

- 工具。
- 平台。
- App 或网站。
- 开始时间。
- 结束时间。
- 活跃时长。
- 夜间使用。
- 工具切换。

自动检测不能可靠得到：

- 估计节省时间。
- 输出质量。
- 是否返工。
- 用户感受。
- prompt 内容和输出内容。

所以技术方案必须保留用户补全层。

### 2.3 iOS 移除

所有 iOS 相关实现从当前技术范围移除：

- 不实现 iOS App。
- 不实现 WidgetKit。
- 不实现 App Intents。
- 不实现 iOS Share Sheet。
- 不实现 iOS 本地数据库。

后续如果做 iOS，只能作为手动记录或快捷补全端重新立项。

## 3. 总体架构

### 3.1 系统组件

```text
Murmur macOS App
  App Detector
  Optional Window Title Detector
  Local Database
  Dashboard
  Completion Inbox
  Review Engine
  Export
  Browser Extension Bridge

Murmur Android App
  Usage Access Permission Flow
  Usage Events Detector
  Local Database
  Completion Inbox
  Dashboard
  Review Engine
  Export

Murmur Browser Extension
  Background Service Worker
  Tab/Navigation Detector
  AI Domain Matcher
  Sessionizer
  Local Storage
  Popup
  Options
  Optional Native Messaging Bridge
```

### 3.2 统一领域模型

三端语言不同，但必须使用同一套领域规范：

- Tool Catalog JSON schema。
- DetectedSession schema。
- LedgerEntry schema。
- fatigue score 计算规范。
- net gain 计算规范。
- weekly review 规则。
- CSV 导出字段。

建议维护一组跨端 golden fixtures：

```text
fixtures/
  detected_sessions.json
  ledger_entries.json
  expected_daily_summary.json
  expected_fatigue_scores.json
  expected_weekly_review.json
```

Swift、Kotlin、TypeScript 各自实现计算逻辑，但必须跑同一组测试向量，保证结果一致。

### 3.3 数据归属

MVP 不做跨设备云同步。

- macOS App 保存 macOS 自动检测数据和来自浏览器扩展的数据。
- Android App 保存 Android 自动检测数据。
- 浏览器扩展可独立保存数据，也可通过 Native Messaging 同步到 macOS App。

P1 再考虑本地局域网同步、WebDAV、iCloud、Google Drive 或端到端加密同步。

## 4. AI Tool Catalog

自动检测的核心是工具目录。

### 4.1 Tool Catalog 数据结构

```json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "aliases": ["DeepSeek", "深度求索"],
  "macos_bundle_ids": [],
  "macos_app_name_patterns": ["DeepSeek"],
  "macos_title_patterns": ["DeepSeek"],
  "android_package_names": [],
  "web_domains": ["deepseek.com", "chat.deepseek.com"],
  "url_patterns": ["*://chat.deepseek.com/*"],
  "default_enabled": true,
  "confidence": {
    "bundle_id": 0.98,
    "package_name": 0.98,
    "domain": 0.95,
    "app_name": 0.85,
    "title": 0.65,
    "user_mapping": 1.0
  }
}
```

### 4.2 默认工具目录

默认内置：

- ChatGPT
- Claude
- Gemini
- Copilot
- Cursor
- Codex
- Perplexity
- Midjourney
- Poe
- DeepSeek
- 豆包
- Kimi
- 通义千问
- 文心一言
- 讯飞星火
- 秘塔
- 元宝

注意：

- Android package name 和 macOS bundle id 在发布前必须逐项验证。
- 不确定的识别项不能硬编码为高置信度。
- 用户映射规则优先级最高。
- Tool Catalog 必须支持本地编辑。

### 4.3 匹配优先级

匹配顺序：

1. 用户自定义映射。
2. macOS bundle id / Android package name。
3. 浏览器 domain。
4. URL pattern。
5. App name exact match。
6. Window title pattern。
7. 模糊匹配，低置信度，需要用户确认。

置信度建议：

| 匹配方式 | 置信度 |
| --- | --- |
| 用户自定义映射 | 1.00 |
| bundle id / package name | 0.98 |
| domain | 0.95 |
| URL pattern | 0.90 |
| App 名称精确匹配 | 0.85 |
| 窗口标题匹配 | 0.65 |
| 模糊匹配 | 0.40-0.60 |

低于 0.7 的会话进入「疑似 AI 使用」，需要用户确认后才进入待补全主列表。

## 5. 数据库设计

三端都需要本地数据库。macOS 推荐 SQLite + GRDB，Android 推荐 Room，浏览器扩展推荐 IndexedDB。字段保持一致。

### 5.1 detected_sessions

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | UUID |
| source_platform | enum | macos / android / browser |
| source_kind | enum | app / web |
| detector_id | string | 检测器，例如 `macos.workspace` |
| tool_id | string | 匹配工具 |
| tool_name | string | 工具名称快照 |
| raw_app_name | string | 原始 App 名称 |
| raw_bundle_id | string | macOS bundle id |
| raw_package_name | string | Android package name |
| raw_domain | string | 浏览器域名 |
| raw_url_pattern | string | URL pattern，不保存完整敏感 URL |
| window_title_hash | string | 可选，窗口标题哈希 |
| started_at | datetime | 开始时间 |
| ended_at | datetime | 结束时间 |
| active_seconds | integer | 活跃秒数 |
| idle_seconds | integer | 空闲秒数，P1 |
| local_date | string | 本地日期 |
| timezone | string | 时区 |
| is_night | boolean | 是否夜间 |
| confidence | double | 识别置信度 |
| status | enum | pending / completed / ignored / merged / suspected |
| merged_into_session_id | string | 合并目标 |
| prompt_count | integer | prompt 次数，可空 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

索引：

- `source_platform`
- `tool_id`
- `local_date`
- `started_at`
- `status`
- `raw_bundle_id`
- `raw_package_name`
- `raw_domain`

### 5.2 ledger_entries

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | UUID |
| detected_session_id | string | 关联会话 |
| source_platform | enum | 冗余，便于聚合 |
| tool_id | string | 工具 ID |
| tool_name | string | 工具名称快照 |
| use_case_id | string | 用途 ID |
| use_case_name | string | 用途名称快照 |
| estimated_saved_minutes | integer | 估计节省 |
| prompt_minutes | integer | Prompt 时间 |
| review_minutes | integer | 审核时间 |
| edit_minutes | integer | 修改时间 |
| debug_minutes | integer | 查错时间 |
| rework_minutes | integer | 返工时间 |
| total_extra_cost_minutes | integer | 额外成本 |
| net_gain_minutes | integer | 净收益 |
| quality | enum | direct_use / minor_edit / major_edit / useless |
| quality_score | integer | 1-4 |
| quality_penalty | integer | 0/4/9/14 |
| mood | enum | easy / neutral / irritated / tired / anxious |
| mood_weight | integer | 0/2/6/8/10 |
| has_rework | boolean | 是否明显返工 |
| note | string | 可选备注 |
| local_date | string | 本地日期 |
| timezone | string | 时区 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 5.3 tool_catalog_items

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 工具 ID |
| name | string | 展示名称 |
| aliases_json | text | 别名数组 |
| macos_bundle_ids_json | text | bundle id 数组 |
| macos_app_name_patterns_json | text | App 名称规则 |
| macos_title_patterns_json | text | 窗口标题规则 |
| android_package_names_json | text | package 数组 |
| web_domains_json | text | 域名数组 |
| url_patterns_json | text | URL pattern 数组 |
| detection_enabled | boolean | 是否启用 |
| is_default | boolean | 是否默认 |
| user_defined | boolean | 是否用户定义 |
| sort_order | integer | 排序 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 5.4 ignored_targets

用于用户忽略误识别对象。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | UUID |
| target_type | enum | bundle_id / package_name / domain / app_name / title_pattern |
| target_value_hash | string | 对敏感值可哈希 |
| display_value | string | 展示值，可选 |
| source_platform | enum | macos / android / browser |
| reason | string | 用户选择原因 |
| created_at | datetime | 创建时间 |

### 5.5 daily_summaries

日报要同时包含自动检测指标和账本指标。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| local_date | string | 日期 |
| detected_session_count | integer | 检测会话数 |
| pending_session_count | integer | 待补全数 |
| completed_session_count | integer | 已补全数 |
| ignored_session_count | integer | 忽略数 |
| detected_active_seconds | integer | AI 活跃秒数 |
| distinct_tool_count | integer | 工具数量 |
| tool_switch_count | integer | 工具切换次数 |
| night_session_count | integer | 夜间会话数 |
| total_entries | integer | 账本记录数 |
| total_saved_minutes | integer | 总估计节省 |
| total_extra_cost_minutes | integer | 总额外成本 |
| net_gain_minutes | integer | 净收益 |
| total_rework_minutes | integer | 返工时间 |
| rework_rate | double | 返工率 |
| fatigue_score | integer | 疲劳指数 |
| updated_at | datetime | 更新时间 |

## 6. 检测管线

### 6.1 Raw Event

所有平台先转换成统一 Raw Event：

| 字段 | 说明 |
| --- | --- |
| event_id | 本地唯一 ID |
| platform | macos / android / browser |
| event_type | foreground / background / tab_active / tab_inactive / navigation / idle / close |
| timestamp | 事件时间 |
| app_name | App 名称 |
| bundle_id | macOS |
| package_name | Android |
| domain | Browser |
| url_pattern | Browser |
| window_title | 可选，不落明文 |
| tab_id | Browser |
| window_id | Browser |

### 6.2 Tool Matcher

输入 Raw Event，输出：

- matched tool。
- confidence。
- matched rule。
- shouldIgnore。
- needsConfirmation。

伪流程：

```text
if ignored target:
  return ignored

if user mapping exists:
  return matched confidence 1.0

if bundle/package/domain exact match:
  return matched high confidence

if app name/title/url pattern match:
  return matched medium confidence

if fuzzy match:
  return suspected

return non_ai
```

### 6.3 Sessionizer

Sessionizer 将事件流合并为使用会话。

核心规则：

- AI 工具进入前台时开始会话。
- 切换到非 AI 工具时结束当前会话。
- 浏览器切换到非 AI 标签时结束当前网页 AI 会话。
- 同工具相邻会话间隔小于 3 分钟时可自动合并，或进入「建议合并」。
- 活跃时间小于 15 秒的会话默认丢弃或标记为噪声。
- 活跃时间 15-30 秒的会话进入低置信度 pending。
- 活跃时间大于 30 秒进入正常 pending。

会话结束触发：

- App 切换。
- 标签页切换。
- 窗口失焦。
- 浏览器关闭。
- 设备进入空闲，P1。
- 检测器停止。

### 6.4 Completion Flow

会话补全时创建 LedgerEntry：

```text
DetectedSession pending
→ user completes fields
→ EntryCalculator calculates derived fields
→ insert ledger_entries
→ update detected_sessions.status = completed
→ recalculate daily_summaries
```

如果用户忽略：

```text
DetectedSession pending
→ status = ignored
→ 不进入净收益
→ 可进入自动检测统计，也可从主视图隐藏
```

## 7. macOS 技术实现

### 7.1 技术栈

- Swift。
- SwiftUI。
- AppKit。
- SQLite + GRDB。
- Menu Bar Extra。
- Combine 或 Swift Concurrency。
- Native Messaging Host，P1。

### 7.2 App Detector

基础能力：

- 使用 `NSWorkspace.shared.frontmostApplication` 获取当前前台 App。
- 监听 `NSWorkspace.didActivateApplicationNotification` 获取 App 切换。
- 记录上一个前台 App 的开始和结束时间。
- 使用 bundle id 和 App 名称匹配 Tool Catalog。

事件生成：

```text
didActivateApplication(newApp)
→ close previous foreground session candidate
→ create raw event for previous background
→ create raw event for new foreground
→ ToolMatcher.match(newApp)
→ if AI tool matched: start candidate session
```

### 7.3 Window Title Detector，可选

用途：

- 某些 Electron 或网页封装 App 的 bundle id 不稳定。
- App 名称可能泛化。
- 窗口标题可帮助识别 DeepSeek、豆包、Kimi 等。

实现：

- 请求 Accessibility 权限。
- 使用 Accessibility API 读取前台窗口标题。
- 标题明文不落库。
- 只保存匹配结果或哈希。

限制：

- 用户必须显式授权。
- 权限关闭时不影响基础检测。
- 不读取输入框、聊天内容和页面正文。

### 7.4 Browser Extension Bridge

macOS 主 App 接收扩展数据有两种方式：

P0：

- 浏览器扩展独立保存。
- 用户可从扩展导出 CSV。
- macOS 和扩展数据暂不合并。

P1 推荐：

- 使用 Native Messaging。
- 浏览器扩展把 DetectedSession JSON 发给 macOS native host。
- macOS App 写入本地数据库。

消息格式：

```json
{
  "type": "detected_session",
  "schema_version": 1,
  "payload": {
    "id": "uuid",
    "source_platform": "browser",
    "tool_id": "deepseek",
    "raw_domain": "chat.deepseek.com",
    "started_at": "2026-05-03T10:12:00+08:00",
    "ended_at": "2026-05-03T10:26:00+08:00",
    "active_seconds": 840,
    "confidence": 0.95
  }
}
```

### 7.5 macOS 页面

主窗口：

- 今日。
- 待补全。
- 统计。
- 工具。
- 复盘。
- 设置。

菜单栏：

- 今日 AI 使用时长。
- 待补全数量。
- 当前检测状态。
- 暂停检测 1 小时。
- 打开待补全。
- 打开仪表盘。

### 7.6 macOS 权限

默认无需特殊权限即可做 App 前台检测。

可选权限：

- Accessibility，用于窗口标题识别。
- Native Messaging host 安装配置，P1。

不请求：

- 屏幕录制。
- 麦克风。
- 相机。
- 完整磁盘访问。
- 输入监控。

## 8. Android 技术实现

### 8.1 技术栈

- Kotlin。
- Jetpack Compose。
- Room。
- WorkManager。
- Kotlin Coroutines / Flow。
- DataStore。

### 8.2 Usage Access 权限

Android 的使用情况访问不是普通 runtime permission。

流程：

```text
App 检查 Usage Access 状态
→ 未授权显示说明页
→ 用户点击开启
→ 跳转系统 Usage Access Settings
→ 用户授权 Murmur
→ 回到 App
→ 开始检测
```

未授权状态：

- 首页显示权限引导。
- 不生成自动检测会话。
- 用户仍可查看历史和手动补全已有会话。

### 8.3 Usage Events Detector

使用 `UsageStatsManager.queryEvents(start, end)` 查询事件。

关注事件：

- `MOVE_TO_FOREGROUND`
- `MOVE_TO_BACKGROUND`
- 新系统中的 `ACTIVITY_RESUMED`
- 新系统中的 `ACTIVITY_PAUSED`

实现策略：

- 保存 `last_processed_timestamp`。
- 每次 App 打开时查询 `last_processed_timestamp` 到当前时间。
- WorkManager 周期性回补。
- 查询结果转换为 Raw Event。
- package name 匹配 Tool Catalog。
- Sessionizer 生成 DetectedSession。

### 8.4 近实时检测，P1

Android 后台限制导致 UsageStatsManager 不适合无感实时运行。

P1 可选：

- 前台服务。
- 常驻通知显示 `Murmur 正在检测 AI 使用`。
- 用户可随时停止。
- 更频繁 queryEvents。

不建议 P0 使用 AccessibilityService，原因：

- 权限敏感。
- Google Play 对 AccessibilityService 有严格用途限制。
- Murmur 的核心不是辅助障碍用户操作设备。
- 容易造成用户对隐私的担忧。

### 8.5 Android 浏览器网页 AI

UsageStatsManager 通常只能看到 Chrome、Edge、Firefox 等浏览器 App，不稳定提供当前网页 URL。

处理策略：

- Android P0 自动检测原生 AI App。
- Android 上网页 AI 使用不强行识别。
- 如果未来做 Android 浏览器扩展，只支持允许扩展的浏览器生态。
- 不使用 AccessibilityService 去读取地址栏作为 P0 方案。

### 8.6 Android 页面

底部 Tab：

- 今日。
- 待补全。
- 统计。
- 工具。
- 设置。

权限页：

- 解释 Usage Access 用途。
- 明确说明不读取 prompt 和 AI 输出。
- 展示已支持 AI App 列表。
- 跳转系统设置。

## 9. 浏览器扩展技术实现

### 9.1 技术栈

- TypeScript。
- Manifest V3。
- Background service worker。
- Popup UI。
- Options UI。
- chrome.storage.local 或 IndexedDB。
- Native Messaging，P1。

### 9.2 权限

最小权限：

- `tabs`
- `webNavigation`
- `storage`
- `alarms`
- `idle`，P1
- host permissions 限定 AI 域名。

不申请：

- `<all_urls>`，除非用户进入高级模式。
- clipboard。
- debugger。
- downloads，除非导出需要且用户触发。

### 9.3 检测事件

监听：

- `tabs.onActivated`
- `tabs.onUpdated`
- `tabs.onRemoved`
- `windows.onFocusChanged`
- `webNavigation.onCommitted`
- `webNavigation.onCompleted`
- `idle.onStateChanged`，P1
- `alarms.onAlarm` 用于周期 flush。

会话逻辑：

```text
active tab becomes AI domain
→ start web session

active tab leaves AI domain
→ end current web session

window loses focus
→ pause or end session

tab closes
→ end session

browser idle
→ pause session
```

### 9.4 URL 与域名处理

隐私要求：

- 默认保存 domain。
- 不保存完整 URL。
- 如需区分路径，只保存 URL pattern，例如 `chat.deepseek.com/*`。
- query string 不落库。
- fragment 不落库。

匹配：

```text
normalize hostname
→ check ignored domains
→ check tool web_domains
→ check url_patterns
→ create Raw Event
```

### 9.5 Prompt Count，P1

浏览器扩展可以在特定 AI 域名注入 content script，检测用户点击发送按钮或提交快捷键。

P1 限制：

- 只计数。
- 不读取输入框文本。
- 不保存 DOM 内容。
- 每个网站需要单独适配选择器。
- 网站改版会导致失效。
- 用户可关闭。

### 9.6 Popup

状态：

- 当前页面是 AI 工具。
- 当前页面不是 AI 工具。
- 当前会话计时中。
- 检测暂停。
- 有待补全会话。

操作：

- 立即补全当前会话。
- 暂停检测 1 小时。
- 忽略此域名。
- 打开 Options。
- 打开 macOS App，P1。

### 9.7 Options

功能：

- AI 域名列表。
- 自定义域名。
- 忽略域名。
- 导出本地 sessions。
- 清空扩展数据。
- Native Messaging 连接状态。

## 10. 计算逻辑

### 10.1 自动检测指标

自动检测指标来自 `detected_sessions`：

```text
detectedSessionCount = count(sessions)
pendingSessionCount = count(status == pending)
completedSessionCount = count(status == completed)
detectedActiveSeconds = sum(active_seconds)
distinctToolCount = count(distinct tool_id)
nightSessionCount = count(is_night)
toolSwitchCount = count(tool_id changes ordered by started_at)
completionRate = completedSessionCount / detectedSessionCount
```

### 10.2 EntryCalculator

输入：

- LedgerEntry draft。

输出：

- totalExtraCostMinutes。
- netGainMinutes。
- qualityScore。
- qualityPenalty。
- moodWeight。
- hasRework。

公式：

```text
totalExtraCostMinutes =
  promptMinutes
  + reviewMinutes
  + editMinutes
  + debugMinutes
  + reworkMinutes

netGainMinutes =
  estimatedSavedMinutes - totalExtraCostMinutes
```

明显返工：

```text
hasRework =
  reworkMinutes > 0
  OR quality == useless
  OR (netGainMinutes < 0 AND totalExtraCostMinutes >= estimatedSavedMinutes)
```

### 10.3 FatigueCalculator

新版疲劳指数结合自动检测和账本记录。

```text
aiDurationScore = min(18, detectedActiveMinutes / 180 * 18)
sessionFrequencyScore = min(14, detectedSessionCount * 2)
toolSwitchScore = min(10, toolSwitchCount * 2)
nightUsageScore = min(10, nightSessionCount * 4)
pendingBacklogScore = min(8, pendingSessionCount * 2)
reworkScore = min(15, totalReworkMinutes / 60 * 15)
qualityScore = average(qualityPenalty)
moodScore = average(moodWeight)
lowGainScore = completedEntryCount >= 3 AND netGainMinutes <= 0 ? 8 : 0

fatigueScore = clamp(
  aiDurationScore
  + sessionFrequencyScore
  + toolSwitchScore
  + nightUsageScore
  + pendingBacklogScore
  + reworkScore
  + qualityScore
  + moodScore
  + lowGainScore,
  0,
  100
)
```

说明：

- 自动检测项让未补全会话也能影响疲劳参考。
- 净收益、质量、返工和感受只来自已补全记录。
- 样本不足时文案必须保守。

### 10.4 WeeklyReview

周报必须同时显示：

- 自动检测到的 AI 使用次数。
- 已补全的账本记录数。
- 补全率。
- 自动检测总时长。
- 已补全净收益。
- 待补全较多的工具。

洞察规则：

| 洞察 | 条件 |
| --- | --- |
| 高频工具 | 工具检测会话数排名第一 |
| 高切换 | 当日 toolSwitchCount >= 5 |
| 待补全堆积 | pendingSessionCount >= 5 |
| 最省力场景 | 用途记录数 >= 3，平均净收益 > 0，平均质量 >= 3 |
| 最亏时间场景 | 用途记录数 >= 3，平均净收益 < 0 或返工率 > 40% |
| 夜间高摩擦 | 夜间会话 >= 3，且夜间已补全记录平均净收益低于白天 |

## 11. 页面实现细节

### 11.1 今日页

ViewModel 输出：

- detectionStatus。
- detectedSessionCount。
- detectedActiveDuration。
- pendingSessionCount。
- completionRate。
- netGainMinutes。
- fatigueScore。
- recentSessions。
- recentEntries。

状态：

- 检测未开启。
- 检测开启但今日无 AI 使用。
- 检测到 AI 使用但未补全。
- 已补全并可展示净收益。

重要文案：

- 未授权：`开启自动检测后，Murmur 才能识别 AI 使用会话。`
- 待补全：`检测到 N 次 AI 使用，补全后才能计算真实净收益。`
- 无记录：`今天还没有检测到 AI 使用。`

### 11.2 待补全页

ViewModel 输出：

- pendingSessions grouped by date。
- suspectedSessions。
- mergeSuggestions。
- ignoredCount。

操作：

- completeSession。
- ignoreSession。
- mergeSessions。
- remapTool。
- createToolMapping。

合并逻辑：

- 同 tool_id。
- 同 source_platform。
- 间隔 <= 3 分钟。
- 任一会话未 completed。

### 11.3 会话补全页

自动填充：

- tool。
- source platform。
- active duration。
- start/end time。
- isNight。

用户输入：

- useCase。
- estimatedSavedMinutes。
- promptMinutes。
- reviewMinutes。
- editMinutes。
- debugMinutes。
- reworkMinutes。
- quality。
- mood。
- note。

默认值：

```text
estimatedSavedMinutes = 15
promptMinutes = min(activeDurationMinutes, 5)
reviewMinutes = 5
editMinutes = 0
debugMinutes = 0
reworkMinutes = 0
quality = minor_edit
mood = neutral
useCase = last use case for same tool if exists
```

保存事务：

```text
insert ledger_entry
update detected_session.status = completed
recalculate daily_summary
refresh today/review
```

### 11.4 工具目录页

功能：

- 查看默认工具。
- 查看匹配规则。
- 开关某个工具检测。
- 新增自定义 AI 工具。
- 添加 macOS App 映射。
- 添加 Android package 映射。
- 添加浏览器域名。
- 添加忽略规则。

误识别修正：

```text
会话详情
→ 工具识别错误
→ 选择正确工具
→ 保存为用户映射
→ 当前会话和未来会话使用新规则
```

### 11.5 设置页

macOS：

- 前台 App 检测开关。
- 窗口标题检测权限。
- 浏览器扩展连接状态。
- 暂停检测。
- 数据导出。
- 清空数据。

Android：

- Usage Access 状态。
- 跳转系统授权。
- 回补检测。
- 检测频率。
- 前台服务开关，P1。

Extension：

- 域名权限。
- AI 域名列表。
- 暂停检测。
- Native Messaging。
- 清空扩展数据。

## 12. 导出

### 12.1 CSV 文件

需要导出两个表：

1. `murmur_detected_sessions_YYYY-MM-DD.csv`
2. `murmur_ledger_entries_YYYY-MM-DD.csv`

Detected Sessions columns：

```text
id,source_platform,source_kind,tool,raw_app_name,raw_bundle_id,raw_package_name,raw_domain,started_at,ended_at,active_seconds,local_date,is_night,confidence,status,prompt_count
```

Ledger Entries columns：

```text
id,detected_session_id,source_platform,tool,use_case,estimated_saved_minutes,prompt_minutes,review_minutes,edit_minutes,debug_minutes,rework_minutes,total_extra_cost_minutes,net_gain_minutes,quality,mood,note,created_at
```

隐私：

- 默认不导出完整 URL。
- 不导出窗口标题明文。
- 不导出 prompt 内容，因为根本不保存。

### 12.2 Markdown 周报，P1

必须区分自动检测和已补全：

```markdown
# Murmur 周报

## 自动检测概览

## 已补全收益

## 待补全会话

## 最省力场景

## 高摩擦工具

## 下周建议
```

## 13. 隐私与安全

### 13.1 权限透明

每个平台都必须在授权前展示：

- 检测什么。
- 不检测什么。
- 数据保存在哪里。
- 如何暂停。
- 如何清空。

### 13.2 数据最小化

保存：

- 工具 ID。
- App identifier。
- 域名。
- 时间。
- 时长。
- 用户补全字段。

不保存：

- prompt 文本。
- AI 回复。
- 页面正文。
- 截图。
- 录屏。
- 键盘输入。
- 完整 URL query。

### 13.3 暂停检测

所有平台都要支持：

- 暂停 1 小时。
- 暂停到明天。
- 永久关闭。
- 忽略某个工具。
- 忽略某个 App 或域名。

### 13.4 数据保留

建议：

- pending sessions 永久保留，除非用户清理。
- ignored raw sessions 默认保留 30 天后清理。
- ledger entries 永久保留。
- 用户可一键清空。

## 14. 测试方案

### 14.1 Tool Matcher 测试

- bundle id 命中。
- package name 命中。
- domain 命中。
- URL pattern 命中。
- App name 命中。
- title pattern 命中。
- 用户映射优先。
- ignored target 优先。
- 低置信度进入 suspected。

### 14.2 Sessionizer 测试

- AI App 前台开始会话。
- 切换非 AI App 结束会话。
- 同工具短间隔合并。
- 小于 15 秒丢弃。
- 浏览器标签切换结束会话。
- window blur 结束或暂停。
- 跨午夜会话按开始日期归类，或按产品规则拆分，需固定。

建议：跨午夜会话拆成两段，分别归属不同 local_date，方便日报准确。

### 14.3 macOS 测试

- NSWorkspace 切换事件。
- bundle id 匹配。
- App name 匹配。
- Accessibility 权限关闭。
- Accessibility 权限开启。
- 暂停检测。
- 忽略 App。

### 14.4 Android 测试

- 未授权 Usage Access。
- 已授权 Usage Access。
- queryEvents 回补。
- MOVE_TO_FOREGROUND / BACKGROUND 成对。
- 事件缺失时容错。
- WorkManager 周期任务。
- package name 映射。

### 14.5 Browser Extension 测试

- 打开 AI 域名开始会话。
- 切换标签结束会话。
- 关闭标签结束会话。
- 浏览器失焦。
- 非 AI 域名不记录。
- 忽略域名。
- storage 写入失败。
- service worker 休眠恢复后 session flush。

### 14.6 Calculator 测试

- 自动检测指标。
- 净收益。
- 返工率。
- 疲劳指数。
- 周报洞察。
- 样本不足。

## 15. 发布分期

### 15.1 Milestone 0：领域模型和工具目录

交付：

- Tool Catalog schema。
- DetectedSession schema。
- LedgerEntry schema。
- Matcher。
- Sessionizer。
- Calculator。
- Golden fixtures。

### 15.2 Milestone 1：macOS 自动检测 MVP

交付：

- macOS App。
- NSWorkspace Detector。
- 本地数据库。
- 今日页。
- 待补全页。
- 会话补全页。
- CSV 导出。
- 清空数据。

### 15.3 Milestone 2：浏览器扩展 MVP

交付：

- Chrome/Edge MV3 扩展。
- AI 域名检测。
- 会话计时。
- Popup。
- Options。
- 本地导出。
- P1 Native Messaging 预留。

### 15.4 Milestone 3：Android MVP

交付：

- Android App。
- Usage Access 权限流程。
- UsageStatsManager Detector。
- 今日页。
- 待补全页。
- 会话补全页。
- 本地导出。

### 15.5 Milestone 4：跨端体验增强

交付：

- macOS Native Messaging 接收扩展会话。
- Android 前台服务近实时检测。
- Prompt count，浏览器扩展 P1。
- Markdown 周报。
- Pro。

## 16. 验收清单

### 16.1 自动检测验收

- macOS 能自动识别 AI App。
- Android 授权后能自动识别 AI App。
- 浏览器扩展能自动识别 AI 网站。
- 三端都能生成 DetectedSession。
- 会话时间正确。
- 工具匹配可解释。
- 误识别可修正。
- 检测可暂停。

### 16.2 隐私验收

- 不保存 prompt。
- 不保存 AI 输出。
- 不截图。
- 不录屏。
- 不监听键盘。
- 浏览器不保存完整敏感 URL。
- 权限说明清楚。
- 数据可清空。

### 16.3 账本验收

- 待补全会话可补全。
- 补全后创建 LedgerEntry。
- 净收益正确。
- 疲劳指数正确。
- 周报区分检测数据和补全数据。
- CSV 导出完整。

## 17. 主要风险与应对

### 17.1 Android 检测不是实时

风险：

- UsageStatsManager 更适合回补，不是强实时。

应对：

- P0 定义为自动回补检测。
- P1 增加前台服务。
- UI 文案避免承诺毫秒级实时。

### 17.2 浏览器扩展权限过重

风险：

- `<all_urls>` 会降低用户信任。

应对：

- 默认只请求 AI 域名 host permissions。
- 用户自定义域名时再请求新增权限。

### 17.3 Tool Catalog 识别不完整

风险：

- 豆包、DeepSeek 等不同平台包名和域名可能变化。

应对：

- 发布前人工验证默认规则。
- 支持用户自定义映射。
- 支持低置信度确认。
- Tool Catalog 随 App 更新。

### 17.4 自动检测被误解为监控

风险：

- 用户担心 Murmur 读取聊天内容。

应对：

- 权限页明确说明只记录工具、时间和域名。
- 默认不保存完整 URL。
- 不接入分析 SDK。
- 随时暂停检测。

### 17.5 未补全导致 ROI 不完整

风险：

- 用户不补全，无法计算净收益。

应对：

- 今日页明确区分检测和已补全。
- 待补全提醒。
- 批量补全。
- 默认值减少输入成本。

## 18. 开发前待确认

1. macOS App 是否必须成为浏览器扩展的数据汇总站。
2. 浏览器扩展 P0 是否独立运行，还是必须连接 macOS。
3. Android 是否只做 App 检测，不做网页检测。
4. 是否允许 P1 浏览器扩展统计 prompt 次数。
5. 默认 AI Tool Catalog 的包名和 bundle id 谁负责发布前验证。
6. CSV 是否导出 ignored sessions。
7. 跨午夜会话是否拆分。技术建议拆分。
8. macOS 是否目标 Mac App Store。若是，Accessibility 和 Native Messaging 需要更严格评审。

## 19. 官方参考

- [Apple NSWorkspace frontmostApplication](https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication)
- [Apple AXUIElementCopyAttributeValue](https://developer.apple.com/documentation/applicationservices/1462085-axuielementcopyattributevalue)
- [Apple App Sandbox](https://developer.apple.com/documentation/security/app_sandbox)
- [Android UsageStatsManager](https://developer.android.com/reference/android/app/usage/UsageStatsManager)
- [Android AccessibilityService](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService)
- [Chrome Extensions webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation)
- [Chrome Extensions tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Chrome Extensions storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [MDN WebExtensions Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)
