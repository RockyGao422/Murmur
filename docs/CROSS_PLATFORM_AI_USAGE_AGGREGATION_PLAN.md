# Murmur 跨端 AI 使用统计与合理累加技术方案

本文档基于当前仓库状态和新的产品判断编写：**App 只统计 AI 原生应用使用，浏览器扩展只统计 AI 网页使用，再通过统一会话模型进行合理累加**。

生成日期：2026-05-05

## 1. 技术结论

MVP 采用三路检测、统一入账、按口径聚合：

| 来源 | 统计对象 | 技术入口 | 可靠程度 | MVP 定位 |
| --- | --- | --- | --- | --- |
| macOS App | 桌面 AI App | `NSWorkspace` 前台 App 切换，可选窗口标题哈希 | 高 | 必做 |
| Android App | 移动 AI App | `UsageStatsManager.queryEvents` | 高，但需用户授权 | 必做 |
| Browser Extension | AI 网页 | `tabs` / `webNavigation` / `windows` / `alarms`，可选 content script 统计 prompt 次数 | 高 | 必做 |
| macOS App 无插件浏览器检测 | 当前浏览器 URL | Apple Events / 浏览器历史 | 中低 | 不进 MVP，仅 P1 降级方案 |

核心原则：

- 浏览器中的 ChatGPT、Claude、DeepSeek、Kimi 等网页使用，交给浏览器扩展统计。
- 桌面和移动端的 ChatGPT App、Claude App、豆包 App 等原生应用使用，交给系统 App 统计。
- macOS 主 App 是桌面主账本，保存 macOS App 会话和浏览器扩展同步来的网页会话。
- Android App 先本地独立统计；跨设备汇总作为 P1，通过导入导出、本地同步或加密云同步实现。
- 自动检测只生成 `DetectedSession`，不自动推断省时收益；省时、返工、质量、心情仍由用户补全为 `LedgerEntry`。

## 2. 当前仓库现状

已经具备的基础：

- `shared/schemas/` 已有 `detected-session`、`raw-event`、`ledger-entry`、`tool-catalog-item` schema。
- `shared/tool-catalog.json` 已包含默认 AI 工具目录。
- 浏览器扩展已经有 MV3 service worker、tab/navigation 检测、URL 脱敏、sessionizer、本地 `chrome.storage.local`。
- 浏览器扩展已有 `native-messaging.js`，macOS 端已有 `NativeMessagingHost.swift` 雏形。
- macOS 已有 `NSWorkspace.didActivateApplicationNotification` 检测链路和 `Sessionizer`。
- Android 已有 `PACKAGE_USAGE_STATS` 权限声明、`UsageEventsDetector`、`Sessionizer`、Room 基础表。

必须修正的差异：

- 线上的跨端协议必须使用 shared schema 的 snake_case 字段；浏览器扩展内部可 camelCase，但落库、导出、同步必须转换。
- shared `RawEvent.event_type` 当前定义为 `foreground/background/tab_active/tab_inactive/navigation/idle/close`，但浏览器扩展代码使用 `tab_activated/tab_updated/navigation_committed/window_focus_changed` 等内部事件名。需要增加 adapter，把内部事件映射成 canonical event type。
- 浏览器扩展的 `syncSessionToMacOS()` 已存在但没有在会话 finalize 后调用，也没有持久化 `sync_status`。
- macOS `NativeMessagingHost.swift` 只是读 stdin/stdout 的 host 逻辑，还缺 native messaging manifest 安装、host 辅助进程包装、主 App 入库队列。
- Android `DetectedSessionEntity` 目前只覆盖部分字段，缺 `detector_id/raw_package_name/raw_domain/raw_url_pattern/timezone/is_night/prompt_count/merged_into_session_id` 等 canonical 字段。
- macOS 当前用 JSON 文件存储，短期可以继续用 repository upsert 兜住；如果要稳定支持去重、聚合和导入，建议迁到 SQLite/GRDB。

## 3. 目标架构

```text
macOS App Detector
  -> RawEvent(macos, foreground)
  -> ToolMatcher(bundle_id/app_name/title_hash)
  -> Sessionizer(app session)
  -> macOS Local Store

Android Usage Detector
  -> RawEvent(android, foreground/background)
  -> ToolMatcher(package_name)
  -> Sessionizer(app session)
  -> Android Room

Browser Extension Detector
  -> RawEvent(browser, tab_active/tab_inactive/navigation/close)
  -> ToolMatcher(domain/url_pattern)
  -> Sessionizer(web session)
  -> Extension Local Store
  -> Native Messaging sync queue
  -> macOS Import Store

Aggregator
  -> canonical DetectedSession[]
  -> duplicate merge / interval union
  -> Today / Stats / Weekly Review
```

MVP 数据归属：

- macOS App 保存 `source_platform=macos/source_kind=app` 和从扩展导入的 `source_platform=browser/source_kind=web`。
- Browser Extension 保存自己的网页会话，即使没有 macOS App 也能独立展示。
- Android App 保存 `source_platform=android/source_kind=app`。
- 不做服务器账号和云同步；跨设备统一展示作为 P1。

## 4. Canonical 数据模型

所有跨端同步、导出、测试 fixture 使用 snake_case。各端 UI 内部可以用本地命名，但必须有明确 adapter。

### 4.1 DetectedSession

当前 shared schema 已有字段应作为基线：

```json
{
  "id": "uuid",
  "source_platform": "macos | android | browser",
  "source_kind": "app | web",
  "detector_id": "macos.workspace | android.usagestats | browser.extension",
  "tool_id": "chatgpt",
  "tool_name": "ChatGPT",
  "raw_app_name": "ChatGPT",
  "raw_bundle_id": "com.openai.chat",
  "raw_package_name": "com.openai.chatgpt",
  "raw_domain": "chatgpt.com",
  "raw_url_pattern": "chatgpt.com/*",
  "window_title_hash": null,
  "started_at": "2026-05-05T09:00:00+08:00",
  "ended_at": "2026-05-05T09:12:00+08:00",
  "active_seconds": 720,
  "idle_seconds": 0,
  "local_date": "2026-05-05",
  "timezone": "Asia/Shanghai",
  "is_night": false,
  "confidence": 0.95,
  "status": "pending | completed | ignored | merged | suspected",
  "merged_into_session_id": null,
  "prompt_count": 3,
  "created_at": "2026-05-05T09:12:01+08:00",
  "updated_at": "2026-05-05T09:12:01+08:00"
}
```

建议新增同步辅助字段，P0 可以先加在 schema 的 optional properties：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `device_id` | string | 每次安装生成一次，保存在本地设置中 |
| `user_scope_id` | string | P1 同步用，本地配对或账号生成；MVP 可为空 |
| `source_session_id` | string | 源端原始 session id；导入端需要保留 |
| `source_fingerprint` | string | 幂等去重 hash |
| `sync_status` | enum | `local_only / pending / synced / failed` |
| `synced_at` | datetime | 最近成功同步时间 |

`id` 的规则：

- 新会话由检测源生成 UUID，作为全局 session id。
- 导入 macOS 后优先保留源 `id`。
- 如果导入 legacy 数据没有 `id`，用 `source_fingerprint` 查重后生成新 UUID，并把旧 id 写入 `source_session_id`。

`source_fingerprint` 生成逻辑：

```text
sha256(
  source_platform + "|" +
  source_kind + "|" +
  device_id + "|" +
  tool_id + "|" +
  raw_bundle_id/raw_package_name/raw_domain + "|" +
  floor(started_at / 5s) + "|" +
  floor(ended_at / 5s) + "|" +
  active_seconds
)
```

用途：

- Native Messaging 至少一次投递时避免重复入库。
- Android WorkManager 重叠查询窗口避免重复入库。
- 手动导入导出时避免重复入库。

### 4.2 RawEvent

Canonical raw event 只表示平台事件，不保存敏感内容。

| 平台 | event_type | 必填字段 | 说明 |
| --- | --- | --- | --- |
| macOS | `foreground` | `app_name/bundle_id/timestamp` | 前台 App 切换 |
| Android | `foreground/background` | `package_name/timestamp` | UsageStats 事件 |
| Browser | `tab_active` | `tab_id/window_id/domain/url_pattern/timestamp` | 标签页成为活跃页 |
| Browser | `tab_inactive` | `tab_id/window_id/domain/timestamp` | 标签页失活或窗口失焦 |
| Browser | `navigation` | `tab_id/window_id/domain/url_pattern/timestamp` | 主 frame 导航 |
| Browser | `close` | `tab_id/window_id/domain/timestamp` | 标签页关闭 |
| Browser | `idle` | `timestamp` | P1 系统空闲 |

浏览器内部事件映射：

| 当前内部事件 | canonical event_type |
| --- | --- |
| `TAB_ACTIVATED` | `tab_active` |
| previous active tab in `onActivated` | `tab_inactive` |
| `TAB_UPDATED` with URL change | `navigation` |
| `NAVIGATION_COMMITTED` | `navigation` |
| `TAB_REMOVED` | `close` |
| `WINDOW_FOCUS_CHANGED focused=false` | `tab_inactive` |
| `WINDOW_FOCUS_CHANGED focused=true` | `tab_active` |

## 5. Tool Catalog 匹配规则

匹配顺序保持统一：

1. 用户自定义映射，置信度 `1.00`。
2. macOS `bundle_id` 或 Android `package_name`，置信度 `0.98`。
3. 浏览器 `domain`，置信度 `0.95`。
4. 浏览器 `url_pattern`，置信度 `0.90`。
5. App 名称精确匹配，置信度 `0.85`。
6. 窗口标题哈希或标题 pattern 辅助匹配，置信度 `0.65`。
7. 模糊匹配，置信度 `0.40-0.60`，默认进入 `suspected`。

状态规则：

- `confidence >= 0.70` 且时长达到阈值：`pending`。
- `confidence < 0.70`：`suspected`。
- 用户补全后：`completed`。
- 用户忽略后：`ignored`。
- 被合并到另一会话后：`merged`，并写 `merged_into_session_id`。

## 6. macOS App 原生应用统计

### 6.1 事件采集

入口文件对应当前实现：

- `macos/Murmur/Detection/DetectionManager.swift`
- `macos/Murmur/Detection/AppDetector.swift`
- `macos/Murmur/Detection/Sessionizer.swift`

采集流程：

1. App 启动时读取 tool catalog 和 ignored targets。
2. 订阅 `NSWorkspace.didActivateApplicationNotification`。
3. 启动检测后立即执行一次 `manualCheckCurrentApp()`，避免用户启动 Murmur 时已经在 AI App 内导致首个会话漏记。
4. 每次前台 App 切换生成 raw event：

```text
platform = macos
event_type = foreground
timestamp = Date()
app_name = runningApp.localizedName
bundle_id = runningApp.bundleIdentifier
```

5. `ToolMatcher` 只匹配原生 App，不把 Chrome、Safari、Edge、Arc、Firefox 这类浏览器 App 当作 AI 工具。
6. 如果 `windowTitleDetectionEnabled=true`，只保存 `window_title_hash`，不保存窗口标题明文。

### 6.2 会话切分

macOS App sessionizer 使用状态机：

```text
state = idle | in_ai_session
current_session = DetectedSession?
last_event_at = Date?
```

处理逻辑：

1. AI App 进入前台，且当前没有 AI session：开始新会话。
2. AI App 进入前台，且当前是同一 tool：继续当前会话，更新 `ended_at`。
3. AI App 进入前台，且当前是另一 tool：在当前事件时间结束旧会话，再开始新会话。
4. 非 AI App 进入前台，且当前有 AI session：在当前事件时间结束旧会话。
5. App 退出或检测停止：flush 当前会话。
6. 若连续事件间隔超过 idle 阈值，默认 5 分钟：在 `last_event_at` 结束当前会话，避免把用户离开电脑的时间算进去。

最终化规则：

```text
active_seconds < 15       -> discard
15 <= active_seconds < 30 -> status=suspected
active_seconds >= 30      -> status=pending
confidence < 0.70         -> status=suspected
```

跨午夜规则：

- 会话开始日期和结束日期不同，必须按本地时区拆成多段。
- 每一段重新计算 `active_seconds/local_date/is_night/status`。
- 小于 15 秒的分段丢弃。

相邻合并规则：

- 同一 `device_id/source_platform/source_kind/tool_id`。
- 两段间隔 `0-180` 秒。
- 两段都不是 `completed/ignored/merged`。
- 合并后保留第一段 id，第二段标记 `merged`。

### 6.3 macOS 落库

短期可继续用当前 `StorageManager` JSON 文件，但必须新增 repository 语义：

- `upsertSession(session)`：按 `id` 查找，找不到再按 `source_fingerprint` 查找。
- `appendSession` 不允许直接使用在导入场景。
- 保存前统一转 canonical snake_case。

中期建议迁移到 SQLite/GRDB，表结构与第 12 节一致。

## 7. Android App 原生应用统计

### 7.1 权限

Android 必须由用户手动开启“使用情况访问权限”：

```xml
<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" />
```

权限状态判断：

1. `AppOpsManager` 检查当前包是否允许 `PACKAGE_USAGE_STATS`。
2. 未授权时进入 `PermissionScreen`。
3. 用户授权后启动 WorkManager 周期检测。

MVP 不使用：

- AccessibilityService 读取页面内容。
- VPN 抓包。
- 截图、录屏、输入法监听。
- 浏览器 URL 解析。

### 7.2 WorkManager 查询窗口

当前 `DetectionWorker` 已有基础流程，建议调整为：

```text
end_time = now
start_time = max(last_processed_timestamp - overlap_window, now - first_run_window)
overlap_window = 2 minutes
first_run_window = 15 minutes
```

原因：

- `UsageStatsManager` 事件可能延迟。
- Worker 可能中断。
- 重叠窗口必须配合 `source_fingerprint` 去重。

查询范围超过 2 小时时继续沿用当前 bucket 逻辑，避免一次读取过多事件。

### 7.3 前后台事件配对

必须处理“只有 foreground 没有 background”的情况。推荐持久化一个 open foreground state：

```json
{
  "open_package_name": "com.openai.chatgpt",
  "open_started_at": 1777952400000,
  "open_tool_id": "chatgpt"
}
```

配对规则：

1. 按 timestamp 排序所有 raw events。
2. 遇到 `FOREGROUND(pkg)`：
   - 如果已有 open foreground 且 package 不同，用当前 timestamp 关闭旧 open session。
   - 把当前 package 写入 open state。
3. 遇到 `BACKGROUND(pkg)`：
   - 如果 open package 相同，用 background timestamp 关闭 session，并清空 open state。
   - 如果不相同，忽略该 background。
4. Worker 结束时：
   - 不强行关闭仍在前台的 open session。
   - 只更新 `last_processed_timestamp` 到 `end_time`。
5. 下一轮如果发现新的 foreground 或 background，再关闭旧 session。

如果产品需要“打开 App 时回补最近使用”，可以在 Murmur App resume 时主动执行一次同样的查询。

### 7.4 Android 会话字段

`DetectedSessionEntity` 需要补齐 canonical 字段：

| 现字段 | 目标字段 |
| --- | --- |
| `packageName` | 兼容保留，同时写 `raw_package_name` |
| 缺失 | `detector_id = android.usagestats` |
| 缺失 | `raw_app_name`，可从 package manager 获取 label |
| 缺失 | `timezone` |
| 缺失 | `is_night` |
| 缺失 | `idle_seconds = 0` |
| 缺失 | `prompt_count = null` |
| 缺失 | `merged_into_session_id` |
| 缺失 | `source_fingerprint/device_id/sync_status` |

Room migration：

1. 新增 nullable column，写默认值。
2. 旧 `package_name` 数据迁移到 `raw_package_name`。
3. 旧 id 仍保留为本地数据库主键；canonical `id` 建议新增为 string UUID，避免跨端 Long id 冲突。

### 7.5 Android 浏览器边界

Android 上 `UsageStatsManager` 通常只能知道 Chrome/Edge/Firefox 处于前台，不能稳定知道具体网址。因此：

- Android App 不把浏览器使用时间算成 AI 网页。
- Android 手机浏览器内的 AI 网页在 MVP 中不自动统计。
- 后续如果支持 Firefox Android 扩展或特定浏览器集成，作为独立 `source_platform=browser/source_kind=web` 数据源接入。

## 8. 浏览器扩展网页统计

### 8.1 权限边界

扩展只申请必要权限：

- `tabs`：读取当前标签页 URL，用于域名识别。
- `webNavigation`：监听主 frame 导航。
- `storage`：本地保存会话、设置和同步状态。
- `alarms`：定期 flush 和重试同步。
- host permissions：只覆盖 AI 工具域名，不使用 `<all_urls>`。

隐私规则：

- 不保存完整 URL。
- 不保存 title。
- 不保存 prompt 内容。
- 不保存 AI 输出。
- 不读取页面正文。
- prompt_count 默认关闭；开启后只统计 submit 次数。

URL 脱敏：

```text
input:  https://chatgpt.com/c/abc123?model=gpt-4
domain: chatgpt.com
raw_url_pattern: chatgpt.com/c/*
```

如果 path 本身可能包含敏感业务空间，MVP 可进一步降级为只保存 `domain/*`。

### 8.2 事件状态机

当前实现以 domain 为 key，建议改为以 `window_id:tab_id` 为 active key：

```text
session_key = windowId + ":" + tabId
active_sessions = Map<session_key, SessionState>
current_active_key = session_key | null
```

原因：

- 用户可能同时打开多个 ChatGPT 标签页。
- 以 domain 为 key 会把多个标签误认为同一会话。
- 统计 active time 时只能有一个前台 tab 在计时。

SessionState：

```json
{
  "session": "DetectedSession",
  "is_active": true,
  "last_active_started_at": "ISO datetime",
  "accumulated_seconds": 0
}
```

active_seconds 计算必须使用累计活跃段，而不是 `now - started_at`：

```text
onActivate:
  pause previous active session:
    accumulated_seconds += now - last_active_started_at
    is_active = false
  start/resume new AI session:
    last_active_started_at = now
    is_active = true

onWindowBlur:
  pause current active session

onWindowFocus:
  resume active AI tab if current tab is AI domain

onNavigationAway / close:
  finalize session:
    if is_active:
      accumulated_seconds += now - last_active_started_at
    active_seconds = accumulated_seconds
```

这样用户把 ChatGPT 标签放后台 30 分钟，不会被算作 30 分钟 AI 使用。

### 8.3 浏览器事件处理

`onActivated`：

1. 查询新 tab。
2. 对旧 `current_active_key` 触发 `tab_inactive`。
3. 对新 tab URL 做 normalize。
4. 如果命中 AI domain，触发 `tab_active`，开始或恢复会话。
5. 如果不是 AI domain，不开始会话。

`onUpdated` 或 `webNavigation.onCommitted`：

1. 只处理 active tab 的主 frame。
2. 如果从非 AI 导航到 AI：开始会话。
3. 如果从 AI 导航到非 AI：finalize 旧会话。
4. 如果 AI domain 变化，例如 ChatGPT -> Claude：finalize 旧会话，开始新会话。
5. 同一 tool、同一 tab 的 path 变化只更新 `raw_url_pattern`，不拆 session。

`onRemoved`：

- 如果 tab 有 active or paused AI session，finalize。

`windows.onFocusChanged`：

- `WINDOW_ID_NONE`：pause current active session。
- 恢复焦点：查询 active tab，如果是 AI domain，resume。

`alarms`：

- 每 1-5 分钟 flush `active_sessions` 到 storage，防 service worker 被回收。
- 每 5-10 分钟重试 Native Messaging sync queue。

### 8.4 浏览器会话最终化

最终化逻辑与 macOS 保持一致：

```text
active_seconds < 15       -> discard
15 <= active_seconds < 30 -> status=suspected
active_seconds >= 30      -> status=pending
confidence < 0.70         -> status=suspected
```

相邻合并：

- 同一 `device_id/source_platform=browser/source_kind=web/tool_id`。
- gap `0-180` 秒。
- 两段不是 completed/ignored/merged。
- prompt_count 相加。
- 保留第一段 id，第二段标记 merged。

### 8.5 prompt_count

content script 只在用户开启 `promptCountingEnabled` 后启用，并且只注入 AI host permissions 内的域名。

计数规则：

- 监听 form submit、Enter 发送按钮、站点特定发送按钮。
- 每次只上报 `{domain, session_id?, event_type: "prompt_submitted"}`。
- background 只做 `prompt_count += 1`。
- 不传输 input value、DOM text、response text、截图。

prompt_count 只用于网页会话，App 会话保持 `null` 或 `0`，不得推断。

## 9. Browser Extension -> macOS Native Messaging

### 9.1 同步语义

同步采用至少一次投递：

- 扩展本地先保存 session。
- 保存成功后写 `sync_status=pending`。
- 若 Native Messaging 可用，立即发送。
- 收到 ack 后更新为 `synced` 和 `synced_at`。
- 失败保持 `failed/pending`，由 alarm 重试。

最终一致性靠 `id/source_fingerprint` 幂等 upsert 保证。

### 9.2 Native Messaging host 打包方式

Chrome/Edge Native Messaging 不是连接一个已经运行的 Swift 对象，而是通过 manifest 启动一个 host 可执行文件。推荐实现：

```text
Murmur.app
  Contents/MacOS/Murmur                    主 App
  Contents/MacOS/murmur-native-host        Native Messaging helper
```

安装 host manifest：

```json
{
  "name": "app.murmur.native_host",
  "description": "Murmur Native Messaging Host",
  "path": "/Applications/Murmur.app/Contents/MacOS/murmur-native-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<extension-id>/"
  ]
}
```

`<extension-id>` 的替换规则：

- `allowed_origins` 不能写通配符，必须写真实扩展 origin，格式是 `chrome-extension://真实扩展ID/`。
- 真实扩展 ID 是浏览器分配给扩展的 32 位字符串，例如 `abcdefghijklmnopabcdefghijklmnop`。
- 扩展自身可以通过 `chrome.runtime.id` 读取自己的 ID，并在 Options 页展示“扩展 ID / 复制”按钮。
- 用户也可以在 `chrome://extensions` 开启开发者模式后，在 Murmur 扩展卡片上看到 ID。

生产发布推荐流程：

1. 先发布或创建 Chrome Web Store 草稿，拿到正式 Chrome 扩展 ID。
2. 如果支持 Edge Add-ons，也拿到 Edge 版本扩展 ID。不同商店的扩展 ID 可能不同。
3. macOS App 内置这些正式 ID。
4. 用户在 macOS App 设置页开启“本地消息桥接”时，App 用内置 ID 生成 host manifest。

生成后的 `allowed_origins` 示例：

```json
{
  "allowed_origins": [
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
    "chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba/"
  ]
}
```

开发调试流程：

1. 开发者在 Chrome 加载 `browser-extension/dist` unpacked extension。
2. 打开扩展 Options 页或 `chrome://extensions`，复制当前扩展 ID。
3. 在 macOS App 的开发设置中粘贴该 ID。
4. macOS App 校验 ID 后重写 host manifest。
5. 回到扩展 Options 页点击“连接本地 App”。

注意：第一次配对不能依赖 Native Messaging 自动把扩展 ID 发给 macOS App，因为 host manifest 还没有允许该扩展时，`chrome.runtime.connectNative()` 会直接失败。开发环境必须手动复制 ID，或通过固定扩展 ID 解决。

固定开发扩展 ID 的可选方案：

- 在扩展 `manifest.json` 中加入 Chrome 支持的 `key` 字段，可以让 unpacked extension 在不同机器或路径下保持同一个 ID。
- `key` 是公钥，不是私钥；不要把私钥提交到仓库。
- 生产版本以 Chrome Web Store / Edge Add-ons 分配的正式 ID 为准，不依赖开发 `key`。

macOS manifest installer 实现要求：

```text
extension_ids = release_ids + user_configured_dev_ids
for id in extension_ids:
  validate id matches ^[a-p]{32}$
allowed_origins = extension_ids.map("chrome-extension://" + id + "/")
write app.murmur.native_host.json atomically
```

安装位置：

- Chrome: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/app.murmur.native_host.json`
- Edge: `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/app.murmur.native_host.json`
- Chromium/Arc 需按各自 Native Messaging host 路径单独验证后支持。

主 App 设置页开启“本地消息桥接”时：

1. 安装或更新 host manifest。
2. 写入 allowed extension id。
3. 检查 helper 可执行权限。
4. 给扩展显示连接指引。

关闭时：

1. 不删除用户数据。
2. 可以删除 host manifest，或保留 manifest 但让 helper 返回 disabled。

### 9.3 Host 与主 App 的交接

helper 被浏览器启动后不能假设主 App 正在运行。推荐使用 import queue：

```text
~/Library/Application Support/Murmur/import_queue/
  browser-session-<uuid>.json
```

helper 流程：

1. 读取 Native Messaging length-prefixed JSON。
2. 校验 message type、schema_version、payload。
3. 写入 import queue 的临时文件。
4. atomic rename 为 `.json`。
5. 返回 ack。
6. 可选通过 `DistributedNotificationCenter` 通知主 App 立即 ingest。

主 App 流程：

1. 启动时扫描 import queue。
2. 收到通知时扫描 import queue。
3. 对每个 payload 执行 `upsertSession`。
4. 成功后移动到 `imported/` 或删除。
5. 失败移动到 `failed/`，保留错误日志。

这样即使主 App 没运行，扩展同步的数据也不会丢。

### 9.4 消息协议

扩展发送：

```json
{
  "type": "detected_session.upsert",
  "schema_version": 1,
  "sent_at": "2026-05-05T10:00:00+08:00",
  "payload": {
    "id": "uuid",
    "device_id": "browser-installation-uuid",
    "source_platform": "browser",
    "source_kind": "web",
    "detector_id": "browser.extension",
    "tool_id": "chatgpt",
    "tool_name": "ChatGPT",
    "raw_domain": "chatgpt.com",
    "raw_url_pattern": "chatgpt.com/*",
    "started_at": "2026-05-05T09:48:00+08:00",
    "ended_at": "2026-05-05T09:59:00+08:00",
    "active_seconds": 660,
    "idle_seconds": 0,
    "local_date": "2026-05-05",
    "timezone": "Asia/Shanghai",
    "is_night": false,
    "confidence": 0.95,
    "status": "pending",
    "prompt_count": 4,
    "source_fingerprint": "sha256..."
  }
}
```

host 返回：

```json
{
  "status": "ok",
  "session_id": "uuid",
  "import_status": "queued | upserted",
  "message": "queued"
}
```

错误返回：

```json
{
  "status": "error",
  "code": "schema_validation_failed",
  "message": "active_seconds must be >= 0"
}
```

### 9.5 当前代码改造点

浏览器扩展：

- `native-messaging.js` payload 改为 snake_case canonical 字段。
- `sessionizer.js` 每次 `saveSession()` 成功后调用 `syncSessionToMacOS(session)`。
- 新增 `sync_status/synced_at/sync_error` 字段。
- `syncPendingToMacOS()` 在 alarm 中调用，并在 ack 后更新本地 session。

macOS：

- 将 `NativeMessagingHost.swift` 改为 helper target，或保留解码逻辑并由 helper 调用。
- 新增 host manifest 安装器。
- 新增 import queue ingest service。
- `StorageManager` 新增 `upsertSession`，不能简单 append。

## 10. Android 与其他端互通

MVP 不做自动跨设备同步，因此 Android 数据不会自动进入 macOS 总账本。产品上需要明确：

- Android App 内展示 Android AI App 使用。
- macOS App 内展示 macOS AI App + 桌面浏览器扩展网页使用。
- 跨设备总览为 P1。

P1 同步建议按风险从低到高推进：

1. **手动导入导出**：Android 导出 `detected_sessions.json`，macOS 导入并 upsert。
2. **局域网配对同步**：macOS 显示一次性配对码，Android 扫码后通过局域网 HTTPS 发送 encrypted sync package。
3. **用户自选云盘同步**：Google Drive/WebDAV/iCloud 文件夹，端到端加密。
4. **账号云同步**：最后再考虑，需要隐私政策、服务端和账号体系。

Sync package 格式：

```json
{
  "schema_version": 1,
  "exported_at": "2026-05-05T20:00:00+08:00",
  "device_id": "android-installation-uuid",
  "sessions": [],
  "ledger_entries": []
}
```

导入规则：

- 只导入 canonical schema 字段。
- 按 `id/source_fingerprint` 幂等 upsert。
- 保留来源 `source_platform=android/source_kind=app`。
- 不把 Android 的 Chrome 使用推断为网页 AI。

## 11. 合理累加与去重口径

Murmur 需要同时支持三种统计口径，避免“简单相加”导致误解。

### 11.1 Session count

默认会话数：

```text
count(status in pending/completed/suspected)
exclude ignored
exclude merged source rows
```

UI 展示：

- `检测到 N 次 AI 使用`：包含 pending/completed/suspected，不含 ignored/merged。
- `待补全 N 次`：pending + suspected。
- `已补全 N 次`：completed。
- suspected 应有单独标识，避免低置信度混入主结论。

### 11.2 Active seconds

定义两个指标：

| 指标 | 计算方式 | 用途 |
| --- | --- | --- |
| `gross_active_seconds` | 各来源会话 active_seconds 求和，排除 ignored/merged | 来源分布、工具分布 |
| `deduped_active_seconds` | 对同一用户、同一日的会话时间区间求 union | 今日总 AI 使用时长 |

为什么需要两个：

- 用户可能同时在电脑浏览器开 ChatGPT、手机打开豆包。
- 简单相加能回答“所有设备/来源累计前台使用量”。
- 区间 union 能回答“今天有多少墙钟时间被 AI 使用占据”。

今日页主指标建议使用：

- `今日 AI 使用时长`：`deduped_active_seconds`。
- `来源分布`：`gross_active_seconds`。

### 11.3 区间 union 算法

输入：

```text
sessions where
  local_date = target_date
  status not in ignored/merged
  active_seconds >= 15
```

处理：

1. 将每个 session 转为 `[started_at, ended_at]`。
2. 跨午夜会话已在 sessionizer 阶段拆分。
3. 按 `started_at` 排序。
4. 遍历合并重叠区间。
5. union 秒数求和。

伪代码：

```text
intervals = sessions.map([start, end]).sortBy(start)
merged = []
for interval in intervals:
  if merged is empty or interval.start > merged.last.end:
    merged.append(interval)
  else:
    merged.last.end = max(merged.last.end, interval.end)
deduped_seconds = sum(end - start for merged)
```

注意：

- union 只用于总时长，不修改原始 session。
- 来源分布、工具分布仍使用原始 `active_seconds`。

### 11.4 同源相邻合并

同一设备、同一来源、同一工具，在短时间内切出去又切回来，默认视为一次使用：

```text
same device_id
same source_platform
same source_kind
same tool_id
gap <= 180 seconds
both status not in completed/ignored/merged
```

合并后：

- target `started_at = min(started_at)`。
- target `ended_at = max(ended_at)`。
- target `active_seconds = sum(active_seconds)`，不要把 gap 算入 active_seconds。
- target `prompt_count = sum(prompt_count)`，仅网页有效。
- source `status=merged`，`merged_into_session_id=target.id`。

### 11.5 跨源重复去重

MVP 正常不会产生“macOS App 统计浏览器网页”和“扩展统计浏览器网页”的重复，因为 macOS 不做无插件浏览器 URL 检测。

如果 P1 加入 macOS 无插件浏览器检测，则去重规则：

1. `browser.extension` 优先级最高。
2. `macos.browser_fallback` 与 `browser.extension` 在同一设备、同一 tool、时间重叠超过 70% 时，fallback session 标记为 `merged` 或 `ignored_duplicate`。
3. prompt_count 只保留 extension 的值。
4. active_seconds 使用 extension 的累计活跃秒数。

### 11.6 LedgerEntry 统计

自动检测不能推断收益。净收益只来自用户补全的 ledger：

```text
total_extra_cost_minutes =
  prompt_minutes +
  review_minutes +
  edit_minutes +
  debug_minutes +
  rework_minutes

net_gain_minutes =
  estimated_saved_minutes - total_extra_cost_minutes
```

日报/周报必须展示样本质量：

```text
检测到 42 次
已补全 18 次
补全率 42.9%
净收益只基于已补全样本计算
```

## 12. 存储设计

### 12.1 detected_sessions 表

目标表字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string primary key | canonical UUID |
| `device_id` | string | 安装级设备 id |
| `user_scope_id` | string nullable | P1 同步用 |
| `source_platform` | string | macos/android/browser |
| `source_kind` | string | app/web |
| `detector_id` | string | 检测器 |
| `tool_id` | string nullable | 工具 id |
| `tool_name` | string nullable | 工具名快照 |
| `raw_app_name` | string nullable | App 名称 |
| `raw_bundle_id` | string nullable | macOS bundle id |
| `raw_package_name` | string nullable | Android package |
| `raw_domain` | string nullable | 网页域名 |
| `raw_url_pattern` | string nullable | 脱敏 URL pattern |
| `window_title_hash` | string nullable | 窗口标题 hash |
| `started_at` | datetime | 开始 |
| `ended_at` | datetime | 结束 |
| `active_seconds` | integer | 活跃秒数 |
| `idle_seconds` | integer | 空闲秒数 |
| `local_date` | string | YYYY-MM-DD |
| `timezone` | string | IANA timezone |
| `is_night` | boolean | 夜间 |
| `confidence` | real | 0-1 |
| `status` | string | pending/completed/ignored/merged/suspected |
| `merged_into_session_id` | string nullable | 合并目标 |
| `prompt_count` | integer nullable | 网页 prompt 次数 |
| `source_session_id` | string nullable | legacy/import id |
| `source_fingerprint` | string unique | 幂等去重 |
| `sync_status` | string | local_only/pending/synced/failed |
| `synced_at` | datetime nullable | 同步时间 |
| `created_at` | datetime | 创建 |
| `updated_at` | datetime | 更新 |

索引：

```sql
CREATE INDEX idx_sessions_date ON detected_sessions(local_date);
CREATE INDEX idx_sessions_tool ON detected_sessions(tool_id);
CREATE INDEX idx_sessions_source ON detected_sessions(source_platform, source_kind);
CREATE INDEX idx_sessions_status ON detected_sessions(status);
CREATE INDEX idx_sessions_time ON detected_sessions(started_at, ended_at);
CREATE UNIQUE INDEX idx_sessions_fingerprint ON detected_sessions(source_fingerprint);
```

### 12.2 Browser Extension 存储

P0 可以继续 `chrome.storage.local`，但要改结构：

```json
{
  "murmur_sessions": [],
  "murmur_active_sessions": {
    "windowId:tabId": {
      "session": {},
      "is_active": false,
      "last_active_started_at": null,
      "accumulated_seconds": 123
    }
  },
  "murmur_sync_queue": [
    {
      "session_id": "uuid",
      "attempts": 1,
      "last_error": null,
      "next_retry_at": 1777952400000
    }
  ]
}
```

超过 MVP 后迁移 IndexedDB：

- session 数量会增长。
- array 全量读写容易产生竞态和性能问题。
- IndexedDB 支持按日期、状态、sync_status 查询。

### 12.3 macOS 存储

短期 JSON 约束：

- 所有写入必须经过 `upsertSession`。
- 写入时做 file lock 或串行写队列。
- 不允许多个位置直接 `loadSessions -> append -> saveSessions`。
- import queue ingest 完成后再刷新 ViewModel。

长期 SQLite/GRDB：

- `detected_sessions`、`ledger_entries`、`tool_catalog`、`ignored_targets`、`sync_events`。
- 聚合查询可以由 SQL 完成，减少 UI 端重复计算。

### 12.4 Android Room

Room 使用本地 Long 主键可以保留，但 canonical string id 必须新增：

```text
local_id: Long autoGenerate primary key
id: String unique canonical UUID
```

这样可以：

- 避免 Android Long id 与 macOS/browser id 冲突。
- 导出导入时保持跨端 session identity。
- UI 仍可使用 local_id 做 Room 导航参数。

## 13. 聚合器实现

建议新增跨端同名模块：

```text
shared/fixtures/
macos/Murmur/Aggregation/
android/app/.../domain/aggregation/
browser-extension/src/aggregation/
```

核心函数：

```text
normalizeSessions(sessions)
mergeAdjacentSessions(sessions, windowSeconds=180)
dedupeDuplicateSessions(sessions)
calculateGrossActiveSeconds(sessions)
calculateDedupedActiveSeconds(sessions)
calculateToolDistribution(sessions)
calculateSourceDistribution(sessions)
calculateCompletionRate(sessions, entries)
```

今日汇总：

```json
{
  "local_date": "2026-05-05",
  "detected_session_count": 12,
  "pending_session_count": 5,
  "completed_session_count": 7,
  "suspected_session_count": 2,
  "gross_active_seconds": 5400,
  "deduped_active_seconds": 4800,
  "app_active_seconds": 3000,
  "web_active_seconds": 2400,
  "prompt_count": 18,
  "net_gain_minutes": 95,
  "completion_rate": 0.58
}
```

过滤规则：

```text
included = status in pending/completed/suspected
excluded = status in ignored/merged
```

工具分布：

- 使用 `gross_active_seconds`。
- unknown tool 只在 suspected 区域展示，不进入主工具排名。

来源分布：

```text
macOS App: source_platform=macos, source_kind=app
Android App: source_platform=android, source_kind=app
Browser Web: source_platform=browser, source_kind=web
```

## 14. UI 展示逻辑

今日页：

- 主指标：`今日 AI 使用时长 = deduped_active_seconds`。
- 次指标：`检测到 N 次`、`待补全 N 次`、`已补全 N 次`、`网页 prompt N 次`。
- 来源分布：App / Web 使用 `gross_active_seconds`。
- 低置信度 session 放入“疑似”区域，用户确认后进入待补全。

Inbox：

- 默认展示 `pending`。
- `suspected` 单独 tab 或 badge。
- 支持忽略、合并、补全。

Stats：

- 工具排名按 `gross_active_seconds`。
- 趋势图按 `deduped_active_seconds`。
- completion rate 始终可见，避免用户误解净收益样本。

Settings：

- macOS：检测开关、窗口标题哈希辅助、Native Messaging 桥接、数据导出。
- Android：使用情况访问权限、检测开关、回补窗口、数据导出。
- Browser Extension：工具域名开关、prompt_count 开关、本地消息桥接状态、数据导出。

## 15. 隐私与合规边界

必须写入产品和权限说明：

- Murmur 只检测 AI 使用会话元数据。
- 不保存 prompt 内容。
- 不保存 AI 输出。
- 不保存完整 URL。
- 不保存网页标题。
- 不保存页面正文。
- 不截图、不录屏、不监听键盘。
- Android 不使用 AccessibilityService 读取内容。
- macOS 窗口标题只允许保存 hash，且默认关闭。
- Native Messaging 只在用户开启桥接后启用。

数据删除：

- 每端设置页必须有“清除本地数据”。
- 清除 macOS 数据时也要清理 import queue。
- 清除扩展数据时清理 sessions、entries、sync_queue、prompt_counts。

## 16. 分阶段实施计划

### P0.1 Schema 和 adapter 对齐

- shared schema 增加 optional sync 字段。
- 浏览器 RawEvent event type 增加 canonical adapter。
- 三端统一 snake_case 导出和同步。
- 增加 schema validation 测试。
- 更新 golden fixtures。

### P0.2 macOS App 统计稳定

- 启动时执行一次当前前台 App 检查。
- 确保浏览器 App 不被当成 AI App。
- `StorageManager` 增加 `upsertSession`。
- 检测停止/退出时 flush current session。
- 添加跨午夜、工具切换、idle flush 测试。

### P0.3 Android App 统计稳定

- 增加 canonical string id 和缺失字段。
- WorkManager 使用 overlap window。
- 持久化 open foreground state。
- 用 `source_fingerprint` 去重。
- 补齐 Room migration 和 sessionizer 测试。

### P0.4 浏览器扩展网页统计稳定

- active session 从 domain key 改成 `windowId:tabId`。
- active_seconds 改成累计活跃段。
- service worker recovery 支持多个 active sessions。
- URL 只保存 domain/url_pattern。
- prompt_count 继续默认关闭。
- 最终化后写 sync queue。

### P0.5 Native Messaging 打通

- 新增 macOS helper executable。
- 安装 Chrome/Edge host manifest。
- 扩展发送 canonical payload。
- helper 写 import queue。
- macOS ingest queue 幂等 upsert。
- ack 后扩展更新 `sync_status=synced`。
- 加入 batch retry。

### P0.6 聚合与展示

- 实现 gross/deduped 两套 active seconds。
- Today/Stats/Weekly Review 使用统一 aggregation。
- UI 清楚区分 App/Web、pending/completed/suspected。
- 净收益只基于 LedgerEntry。

### P1 跨设备同步

- 先做导入导出。
- 再做局域网配对同步。
- 最后评估云同步或账号系统。

### P1 无插件浏览器 fallback

- 仅作为低置信度降级。
- 命中 extension 同时存在时，extension 优先。
- 不统计 prompt_count。

## 17. 测试计划

Shared fixtures：

- `detected_sessions.json` 覆盖 macOS app、Android app、browser web。
- `expected_daily_summary.json` 同时给出 gross/deduped。
- `expected_fatigue_scores.json` 只基于 completed ledger。

macOS 单元测试：

- AI App -> 非 AI App 结束会话。
- AI Tool A -> AI Tool B 拆分会话。
- 同一工具 3 分钟内相邻合并。
- 跨午夜拆分。
- idle 超过 5 分钟 flush。
- Native Messaging import 同一 payload 两次只入库一次。

Android 单元测试：

- foreground/background 正常配对。
- 缺 background 时持久化 open state。
- 新 foreground 关闭旧 open session。
- overlap window 不重复入库。
- 跨午夜拆分。
- 小于 15 秒丢弃，15-30 秒 suspected。

浏览器扩展测试：

- URL normalize 不保存 query/fragment/full URL。
- 多 tab 同域不会互相覆盖。
- tab 后台时间不计入 active_seconds。
- window blur 后停止计时。
- navigation AI -> 非 AI finalize。
- service worker restart 后恢复 active session state。
- Native Messaging 失败进入 retry queue。

E2E：

1. 打开 ChatGPT 网页 2 分钟，切到非 AI 标签 1 分钟，回到 ChatGPT 2 分钟。
   - 结果：一个或两个可合并 browser web session，active_seconds 约 240 秒，不包含后台 60 秒。
2. 同时打开 Claude 桌面 App 5 分钟和 ChatGPT 网页 5 分钟。
   - gross = 600 秒，deduped 约 300 秒。
3. 扩展重复发送同一个 session 两次。
   - macOS 只保存一条。
4. Android 查询窗口重叠两次。
   - Room 只保存一条。

## 18. 发布验收标准

MVP 可发布必须满足：

- macOS、Android、Browser Extension 都能生成 canonical `DetectedSession`。
- App 统计不把浏览器网页使用误算为 AI App 使用。
- 扩展统计不保存完整 URL、prompt 内容、AI 输出、页面正文。
- 浏览器后台时间不计入 active_seconds。
- Native Messaging 开启后，扩展网页 session 能进入 macOS 主账本。
- 重复同步不会重复累加。
- 今日页区分 `deduped_active_seconds` 和来源分布。
- 净收益只来自用户补全的 `LedgerEntry`。
- shared fixtures 在三端计算结果一致。

## 19. 推荐文件改造清单

Shared：

- `shared/schemas/detected-session.schema.json`
- `shared/schemas/raw-event.schema.json`
- `shared/fixtures/*`

Browser Extension：

- `browser-extension/src/shared/enums.js`
- `browser-extension/src/background/detector.js`
- `browser-extension/src/background/sessionizer.js`
- `browser-extension/src/background/native-messaging.js`
- `browser-extension/src/background/service-worker.js`
- `browser-extension/src/shared/storage.js`

macOS：

- `macos/Murmur/Detection/AppDetector.swift`
- `macos/Murmur/Detection/Sessionizer.swift`
- `macos/Murmur/Storage/StorageManager.swift`
- `macos/Murmur/NativeMessaging/NativeMessagingHost.swift`
- 新增 native host helper target
- 新增 Native Messaging manifest installer
- 新增 import queue ingest service

Android：

- `android/app/src/main/java/com/murmur/app/domain/model/Models.kt`
- `android/app/src/main/java/com/murmur/app/data/local/entity/DetectedSessionEntity.kt`
- `android/app/src/main/java/com/murmur/app/data/local/dao/DetectedSessionDao.kt`
- `android/app/src/main/java/com/murmur/app/domain/detection/Sessionizer.kt`
- `android/app/src/main/java/com/murmur/app/worker/DetectionWorker.kt`
- `android/app/src/main/java/com/murmur/app/data/repository/SessionRepository.kt`

## 20. 最终产品口径

对用户的解释应保持简单：

```text
Murmur 会自动识别你在 App 和网页中使用 AI 的时间。
桌面和手机 App 使用由 Murmur App 本地检测。
网页 AI 使用由浏览器扩展检测。
所有数据只保存使用会话元数据，不保存你的 prompt、回答内容或完整网址。
今日总时长会自动去重，来源分布会保留各端累计用量。
```

这套口径与技术实现一致，也能解释为什么需要 App + 浏览器扩展共同工作。
