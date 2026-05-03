# Murmur 产品说明文档 PRD

你的 AI 使用回声。

Murmur 是一个面向高频 AI 使用者的本地优先效率工具。新版产品方向从「移动端手动记录」调整为 **macOS、Android、浏览器扩展优先，并且必须具备自动检测 AI 使用的能力**。

Murmur 不再把第一版重点放在 iOS。当前版本 **暂不支持 iOS**，因为 iOS 普通 App 很难在合规范围内自动识别用户是否正在使用豆包、DeepSeek、ChatGPT、Claude、Kimi 等第三方 AI 工具。Murmur 的核心体验必须是自动检测，因此平台范围调整为自动检测能力更可行的 macOS、Android 和浏览器扩展。

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 产品名称 | Murmur |
| 产品副标题 | 你的 AI 使用回声 |
| 产品定位 | 自动检测 AI 使用，并帮助用户看见 AI 的真实省力收益 |
| 文档类型 | PRD / 产品说明文档 |
| 当前阶段 | 自动检测版 MVP 设计 |
| 当前支持平台 | macOS、Android、浏览器扩展 |
| 当前不支持平台 | iOS 暂不支持 |
| 核心变化 | 从手动记录优先改为自动检测优先 |
| 原型稿 | [Figma Prototype](https://www.figma.com/design/7PGVYEttzthUwNOhVDgFym)，仅作为旧版信息结构参考 |

## 2. 一句话定位

Murmur 自动检测用户在 macOS、Android 和浏览器中使用 AI 工具的会话，并把这些会话转化为「AI 省力账本」：用户只需要轻量补全用途、结果质量和返工成本，就能知道哪些 AI 工具和场景真的省力，哪些只是在制造更多审核、修改和切换成本。

## 3. 本次方向调整

### 3.1 调整前

旧版方向：

- iOS 优先。
- 移动端 App + 小组件。
- 用户用完 AI 后手动记录。
- 自动检测作为后续增强。

### 3.2 调整后

新版方向：

- macOS 优先。
- Android 同步规划。
- 浏览器扩展作为网页 AI 使用检测入口。
- iOS 暂不支持。
- 自动检测作为 P0 核心能力。
- 用户从「主动新建一条记录」变成「确认和补全自动检测到的 AI 会话」。

### 3.3 为什么暂不支持 iOS

iOS 普通 App 无法稳定、合规地做到以下事情：

- 自动知道用户打开了哪个第三方 AI App。
- 自动读取第三方 App 的前台使用时长。
- 自动识别用户访问了哪个 AI 网页。
- 自动知道用户是否真的发起了 prompt。
- 自动读取第三方 AI 输入和输出内容。

如果 Murmur 的核心承诺是「自动检测 AI 使用」，iOS 不适合作为第一版平台。iOS 后续可以作为手动记录端或快捷入口端重新评估，但不进入当前版本范围。

## 4. 自动检测的产品定义

### 4.1 Murmur 自动检测什么

Murmur 自动检测的是 **AI 使用会话**。

一次 AI 使用会话包括：

- 用户使用了哪个 AI 工具。
- 使用发生在哪个平台。
- 使用发生在 App 还是网页。
- 开始时间。
- 结束时间。
- 活跃时长。
- 是否夜间使用。
- 是否发生工具切换。
- 浏览器扩展场景下可选记录 prompt 发送次数，但不记录 prompt 内容。

### 4.2 Murmur 不自动检测什么

Murmur 默认不自动检测：

- prompt 内容。
- AI 输出内容。
- 用户输入的文字。
- 页面正文。
- 截图内容。
- 文件内容。
- 聊天记录。
- 代码内容。

这些内容涉及高敏感隐私，不属于 Murmur 自动检测 MVP 的范围。

### 4.3 自动检测和省力账本的关系

自动检测只能可靠回答：

> 用户什么时候用了哪个 AI 工具，用了多久。

但它不能可靠回答：

> 这次 AI 到底省了多少时间，结果质量如何，是否造成返工，用户是否疲惫。

所以 Murmur 使用双层数据模型：

1. **Detected Session，自动检测会话**
   系统自动生成，包含工具、平台、开始时间、结束时间、活跃时长、来源和置信度。

2. **Ledger Entry，省力账本记录**
   用户轻量补全后生成，包含用途、估计节省时间、Prompt 时间、审核时间、修改时间、查错时间、返工时间、结果质量、感受和备注。

产品核心体验不是让用户从零开始记录，而是：

```text
系统自动发现 AI 使用
→ 生成待补全会话
→ 用户花 5 秒补全关键字段
→ Murmur 计算净收益、疲劳指数和周报
```

## 5. 核心价值主张

用户打开 Murmur 后，应该能看到：

1. 今天我自动检测到了多少次 AI 使用。
2. 哪些 AI 会话还没有补全。
3. 今天 AI 使用总时长是多少。
4. 今天 AI 净收益是多少。
5. 哪些工具最常打断工作流。
6. 哪些 AI 场景真的省力。
7. 哪些 AI 场景带来了返工和疲劳。

推荐表达：

> 自动看见你的 AI 工作收益。

推荐副标题：

> 自动检测 AI 使用会话，记录省时、返工和精力成本，找到真正值得用 AI 的场景。

## 6. 支持平台与自动检测能力

### 6.1 macOS

macOS 端是 MVP 的主账本和主仪表盘。

自动检测能力：

- 识别当前前台 App。
- 通过 App 名称、bundle identifier、窗口标题识别 AI 工具。
- 自动记录 AI App 的前台活跃时间。
- 识别工具切换。
- 识别夜间使用。
- 接收浏览器扩展传来的 AI 网页会话。
- 生成待补全会话。

建议技术能力：

- `NSWorkspace.frontmostApplication` 识别前台 App。
- `NSWorkspace` 通知识别前台 App 切换。
- 可选 Accessibility 权限读取窗口标题，用于提高识别准确率。
- 浏览器网页检测优先交给浏览器扩展，不依赖 macOS 主 App 猜测浏览器标签。

macOS 不做：

- 不读取第三方 App 输入框内容。
- 不截图。
- 不录屏。
- 不读取 AI 对话内容。
- 不监听键盘输入。

### 6.2 Android

Android 端用于检测移动 AI App 使用。

自动检测能力：

- 用户授权使用情况访问后，检测 AI App 前台使用事件。
- 通过 package name 匹配豆包、DeepSeek、Kimi、通义千问、文心一言、ChatGPT、Claude 等 AI App。
- 自动生成 AI 使用会话。
- 识别开始时间、结束时间、使用时长和夜间使用。
- 在用户打开 Murmur 时回补最近一段时间的 AI 使用事件。

建议技术能力：

- `UsageStatsManager.queryEvents` 查询前台使用事件。
- `PACKAGE_USAGE_STATS` 需要用户到系统设置中授权。
- WorkManager 周期性回补。
- P1 可提供前台服务模式，使用常驻通知做更接近实时的检测。

Android 不做：

- P0 不使用 AccessibilityService 读取窗口内容。
- 不读取输入文字。
- 不读取聊天内容。
- 不截图。
- 不使用 VPN 抓包。
- 不解析 AI App 内部页面。

注意：Android 上如果用户在浏览器中使用 AI 网页，UsageStatsManager 通常只能看到浏览器 App 使用，不能稳定知道具体网址。网页 AI 的自动检测主要交给浏览器扩展。

### 6.3 浏览器扩展

浏览器扩展用于检测网页 AI 使用，是识别 DeepSeek 网页、豆包网页、ChatGPT 网页、Claude 网页等场景的主入口。

支持范围：

- Chrome。
- Edge。
- Firefox，P1。

自动检测能力：

- 识别用户访问的 AI 网站域名。
- 识别标签页激活、切换、关闭。
- 识别页面导航。
- 计算 AI 网站活跃时长。
- 识别网页 AI 工具名称。
- 可选检测 prompt 发送次数，但不保存 prompt 内容。
- 本地保存会话，或通过 Native Messaging 发送到 macOS 主 App。

建议技术能力：

- Manifest V3。
- `tabs` API 读取活动标签页 URL 和标题。
- `webNavigation` API 识别页面导航。
- `storage.local` 保存本地会话。
- `idle` API 判断浏览器空闲，P1。
- `nativeMessaging` 与 macOS 主 App 通信，P1。

浏览器扩展不做：

- 不保存 prompt 文本。
- 不保存 AI 回复。
- 不抓取页面正文。
- 不注入远程代码。
- 不访问非 AI 网站，除非用户明确授权。

## 7. AI 工具目录

自动检测依赖一个可维护的 AI Tool Catalog。

### 7.1 默认工具

默认工具应覆盖国际和中国常见 AI 产品：

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
- 其他

### 7.2 工具识别信息

每个工具包含：

- 工具名称。
- 工具别名。
- macOS bundle identifier 列表。
- macOS App 名称匹配规则。
- macOS 窗口标题匹配规则。
- Android package name 列表。
- 浏览器域名列表。
- URL pattern 列表。
- 识别置信度权重。
- 是否默认启用检测。
- 是否允许用户隐藏。

### 7.3 用户自定义映射

如果 Murmur 检测到一个疑似 AI App，但无法匹配工具，用户可以：

- 将该 App 映射为已有工具。
- 创建新的自定义 AI 工具。
- 忽略该 App。
- 永久忽略该 App。

示例：

```text
检测到未知应用：DeepSeek
是否将它识别为 AI 工具？

选项：
→ DeepSeek
→ 创建新工具
→ 忽略一次
→ 永久忽略
```

## 8. 目标用户

新版 Murmur 的第一批用户是高频使用 AI 且跨工具工作的人：

| 用户类型 | 主要平台 | 自动检测价值 |
| --- | --- | --- |
| 程序员 | macOS、浏览器扩展 | 检测 Cursor、ChatGPT、Claude、DeepSeek、Codex 的使用时长和切换 |
| 产品经理 | macOS、浏览器扩展、Android | 检测 AI 写 PRD、竞品分析、会议总结的真实耗时 |
| 内容创作者 | 浏览器扩展、Android | 检测网页 AI 和移动 AI App 的使用频率 |
| 自由职业者 | macOS、Android、浏览器扩展 | 判断 AI 是否真正提升交付效率 |
| 学生/研究者 | 浏览器扩展、Android | 识别 AI 学习和阅读辅助是否过度 |

MVP 聚焦：

- macOS 知识工作者。
- Android 高频 AI App 用户。
- 使用 ChatGPT、DeepSeek、豆包、Kimi、Claude、Cursor 的用户。

## 9. 产品范围

### 9.1 P0 必须完成

- macOS 前台 AI App 自动检测。
- Android AI App 使用事件自动检测。
- 浏览器扩展 AI 网站自动检测。
- AI Tool Catalog。
- 自动会话生成。
- 待补全会话收件箱。
- 用户 5 秒补全会话。
- 今日自动检测次数。
- 今日 AI 使用时长。
- 今日 AI 净收益。
- 疲劳指数。
- 记录编辑与删除。
- 每周复盘。
- CSV 导出。
- 本地隐私说明。
- 一键清空数据。

### 9.2 P1 增强功能

- macOS 菜单栏快速入口。
- macOS 浏览器扩展 Native Messaging 同步。
- Android 前台服务近实时检测。
- 浏览器 prompt 发送次数检测。
- 自定义工具识别规则。
- Markdown 周报导出。
- 通知提醒补全会话。
- Widget，Android 优先。
- Pro 功能。

### 9.3 P2 后续功能

- Firefox 扩展。
- 跨设备本地同步。
- iCloud 或 WebDAV 可选备份。
- 本地 AI 周报总结。
- 团队版。
- iOS 手动记录端，视产品策略重新评估。

## 10. 信息架构

新版 Murmur 使用「自动检测会话」作为核心对象。

### 10.1 macOS 主 App

主导航：

```text
今日 / 待补全 / 统计 / 工具 / 复盘 / 设置
```

今日：

- 今日检测到的 AI 使用次数。
- 今日 AI 使用总时长。
- 今日已补全记录数量。
- 今日待补全会话数量。
- 今日净收益。
- 今日疲劳指数。
- 最近自动检测会话。

待补全：

- 所有自动检测但未补全的会话。
- 支持批量忽略。
- 支持合并相邻会话。
- 支持一键补全。

统计：

- 自动检测次数趋势。
- AI 使用时长趋势。
- 净收益趋势。
- 工具切换趋势。
- 工具分布。
- 场景分布。

工具：

- 工具目录。
- 识别规则。
- 自定义映射。
- 每个工具的自动检测准确率。

复盘：

- 周报。
- 高使用低收益日期。
- 夜间 AI 使用。
- 高切换工具。
- 最值得继续用的 AI 场景。

设置：

- 检测权限。
- 工具目录。
- 浏览器扩展连接状态。
- 数据导出。
- 清空数据。
- 隐私说明。

### 10.2 Android App

底部 Tab：

```text
今日 / 待补全 / 统计 / 工具 / 设置
```

Android 首页重点：

- 使用情况访问权限状态。
- 今日检测到的 AI App 使用。
- 待补全会话。
- 今日 AI 使用时长。
- 今日净收益。

### 10.3 浏览器扩展

扩展 Popup：

- 当前网站是否为 AI 工具。
- 当前会话计时。
- 今日网页 AI 使用时长。
- 待补全会话数量。
- 立即补全当前会话。
- 暂停检测。

扩展 Options：

- 检测域名列表。
- 自定义 AI 网站。
- 忽略域名。
- 本地数据导出。
- 连接 macOS App 状态。

## 11. 核心流程

### 11.1 macOS 首次启动

```text
打开 Murmur
→ 说明自动检测范围和隐私边界
→ 开启前台 App 检测
→ 可选开启辅助功能权限以读取窗口标题
→ 安装或连接浏览器扩展
→ 进入今日页
```

### 11.2 Android 首次启动

```text
打开 Murmur
→ 说明需要使用情况访问权限
→ 跳转系统设置授权
→ 回到 App
→ 检测默认 AI App 列表
→ 进入今日页
```

### 11.3 浏览器扩展首次启动

```text
安装扩展
→ 说明只检测 AI 网站域名和活跃时间
→ 用户确认 host permissions
→ 扩展开始检测 AI 网站访问
→ 本地保存会话或同步到 macOS App
```

### 11.4 自动检测到 AI 使用

```text
用户打开 AI App 或 AI 网站
→ Detector 识别工具
→ Sessionizer 开始计时
→ 用户切换离开或进入空闲
→ Sessionizer 结束会话
→ 生成 Detected Session
→ 会话进入待补全
```

### 11.5 用户补全会话

```text
打开待补全
→ 选择会话
→ 系统已填工具、时间、平台
→ 用户选择用途
→ 选择估计节省时间
→ 确认或调整 Prompt/审核/修改/返工时间
→ 选择结果质量
→ 选择感受
→ 保存为 Ledger Entry
```

### 11.6 用户忽略会话

用户可以忽略：

- 单次会话。
- 某个工具的本次检测。
- 某个 App 或域名的所有后续检测。

忽略后的会话不参与净收益、疲劳指数和周报，但可以保留在原始检测日志中，默认 30 天后清理。

## 12. 页面规格

### 12.1 今日页

页面目标：

让用户看到今天 AI 使用是否过量，以及自动检测到的会话是否已经转化成省力账本。

模块：

| 模块 | 说明 |
| --- | --- |
| 检测状态 | macOS/Android/Extension 当前检测是否启用 |
| 今日 AI 使用时长 | 自动检测到的 AI 活跃总时长 |
| 今日检测次数 | 自动检测会话数量 |
| 待补全数量 | 还没有补全的会话数量 |
| 今日净收益 | 只统计已补全记录 |
| 疲劳指数 | 综合自动检测和已补全记录 |
| 最近会话 | 自动检测会话列表 |

显示规则：

- 自动检测会话可以显示「待补全」。
- 已补全会话显示净收益。
- 被忽略会话不在今日主列表显示，可在设置中查看。

### 12.2 待补全会话页

页面目标：

把自动检测到的 AI 使用转化成可计算 ROI 的记录。

列表字段：

- 工具名称。
- 平台：macOS / Android / Browser。
- 来源：App / Web。
- 开始时间。
- 活跃时长。
- 置信度。
- 状态：待补全 / 已补全 / 已忽略。

操作：

- 补全。
- 忽略。
- 合并相邻会话。
- 拆分会话，P1。
- 修改工具识别。

合并规则：

- 同一工具。
- 同一平台。
- 两段会话间隔小于 3 分钟。
- 用户确认后合并。

### 12.3 会话补全页

系统自动填充：

- 工具。
- 平台。
- 来源 App 或域名。
- 开始时间。
- 结束时间。
- 活跃时长。
- 是否夜间。

用户补全：

- 用途。
- 估计节省时间。
- Prompt 时间。
- 审核时间。
- 修改时间。
- 查错时间。
- 返工时间。
- 结果质量。
- 当前感受。
- 备注，可选。

默认值：

- 用途：同工具上一次用途。
- 估计节省时间：15 分钟。
- Prompt 时间：min(自动会话时长, 5 分钟)，可调整。
- 审核时间：5 分钟。
- 修改、查错、返工：0 分钟。
- 结果质量：需小改。
- 感受：中性。

保存后：

- Detected Session 状态变为 completed。
- 创建 Ledger Entry。
- 今日净收益和疲劳指数刷新。

### 12.4 工具目录页

页面目标：

让用户知道 Murmur 如何判断豆包、DeepSeek、Kimi 等工具，并允许用户修正。

每个工具展示：

- 工具名称。
- 检测开关。
- macOS 识别规则。
- Android package 规则。
- 浏览器域名规则。
- 最近检测次数。
- 误识别次数。
- 用户自定义映射。

操作：

- 启用/停用检测。
- 添加 App 名称匹配。
- 添加 Android package。
- 添加域名。
- 添加 URL pattern。
- 删除用户自定义规则。

### 12.5 浏览器扩展 Popup

状态：

- 当前页面是 AI 网站。
- 当前页面不是 AI 网站。
- 检测已暂停。
- 需要授权 host permissions。
- 已连接 macOS App。
- 未连接 macOS App。

按钮：

- 补全当前会话。
- 暂停 1 小时。
- 忽略此域名。
- 打开仪表盘。
- 打开设置。

### 12.6 设置页

设置项：

- 自动检测总开关。
- macOS 前台 App 检测开关。
- macOS 窗口标题检测权限。
- Android 使用情况访问权限状态。
- 浏览器扩展连接状态。
- AI Tool Catalog 管理。
- 待补全提醒。
- 数据导出。
- 一键清空。
- 隐私说明。

## 13. 数据字段

### 13.1 DetectedSession

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 本地唯一 ID |
| source_platform | enum | macos / android / browser |
| source_kind | enum | app / web |
| detector_id | string | 检测器 ID |
| tool_id | string | 匹配到的工具 |
| tool_name | string | 工具名称快照 |
| raw_app_name | string | 原始 App 名称 |
| raw_bundle_id | string | macOS bundle ID |
| raw_package_name | string | Android package name |
| raw_domain | string | 浏览器域名 |
| raw_url_pattern | string | URL pattern，不保存完整敏感 URL |
| window_title_hash | string | 可选，窗口标题哈希 |
| started_at | datetime | 开始时间 |
| ended_at | datetime | 结束时间 |
| active_seconds | integer | 活跃秒数 |
| local_date | string | 本地日期 |
| timezone | string | 时区 |
| is_night | boolean | 是否夜间 |
| confidence | float | 识别置信度 |
| status | enum | pending / completed / ignored / merged |
| merged_into_session_id | string | 合并目标 |
| prompt_count | integer | 可选，prompt 次数，不含内容 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 13.2 LedgerEntry

LedgerEntry 由用户补全后生成。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 本地唯一 ID |
| detected_session_id | string | 关联自动检测会话 |
| tool_id | string | 工具 ID |
| use_case_id | string | 用途 ID |
| estimated_saved_minutes | integer | 估计节省时间 |
| prompt_minutes | integer | Prompt 时间 |
| review_minutes | integer | 审核时间 |
| edit_minutes | integer | 修改时间 |
| debug_minutes | integer | 查错时间 |
| rework_minutes | integer | 返工时间 |
| total_extra_cost_minutes | integer | 额外成本 |
| net_gain_minutes | integer | 净收益 |
| quality | enum | 结果质量 |
| mood | enum | 当前感受 |
| note | string | 可选备注 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### 13.3 ToolCatalogItem

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 工具 ID |
| name | string | 工具名称 |
| aliases | array | 别名 |
| macos_bundle_ids | array | macOS bundle ID |
| macos_app_name_patterns | array | App 名称匹配 |
| macos_title_patterns | array | 窗口标题匹配 |
| android_package_names | array | Android package name |
| web_domains | array | 浏览器域名 |
| url_patterns | array | URL pattern |
| is_default | boolean | 默认工具 |
| detection_enabled | boolean | 是否启用检测 |
| user_defined | boolean | 是否用户自定义 |

## 14. 指标与计算

### 14.1 自动检测指标

自动检测无需用户补全即可计算：

- AI 使用会话数。
- AI 使用总时长。
- AI 工具切换次数。
- 夜间 AI 使用次数。
- 待补全会话数。
- 未补全比例。
- 不同工具使用时长。
- 不同平台使用时长。

### 14.2 省力账本指标

需要用户补全后才能计算：

- 估计节省时间。
- 额外成本。
- 净收益。
- 返工率。
- 结果质量。
- 感受。
- 最有价值场景。
- 最耗能场景。

### 14.3 AI 净收益

```text
额外成本 = Prompt 时间 + 审核时间 + 修改时间 + 查错时间 + 返工时间
AI 净收益 = 估计节省时间 - 额外成本
```

### 14.4 疲劳指数

新版疲劳指数同时使用自动检测和补全记录。

```text
疲劳指数 = clamp(
  AI 使用时长分
  + AI 会话频率分
  + 工具切换分
  + 夜间使用分
  + 待补全堆积分
  + 返工分
  + 质量分
  + 感受分
  + 低收益分,
  0,
  100
)
```

自动检测贡献：

- AI 使用时长分。
- AI 会话频率分。
- 工具切换分。
- 夜间使用分。
- 待补全堆积分。

用户补全贡献：

- 返工分。
- 质量分。
- 感受分。
- 低收益分。

## 15. 隐私原则

Murmur 自动检测必须遵循：

- 默认只保存本地数据。
- 不上传 AI 使用记录。
- 不读取 prompt 内容。
- 不读取 AI 输出内容。
- 不截图。
- 不录屏。
- 不监听键盘。
- 浏览器扩展只匹配 AI 域名，不默认读取页面正文。
- Android P0 不使用 AccessibilityService。
- macOS Accessibility 权限只用于窗口标题识别，并且必须由用户显式开启。
- 用户可以暂停检测。
- 用户可以忽略某个工具、App 或域名。
- 用户可以导出数据。
- 用户可以清空全部数据。

## 16. MVP 验收标准

### 16.1 macOS 自动检测

- 可以识别前台 AI App。
- 可以根据 Tool Catalog 匹配工具。
- 可以生成 Detected Session。
- 可以正确计算会话开始、结束和活跃时长。
- 切换离开 AI App 后会话结束。
- 同工具短间隔会话可合并或提示合并。
- 不读取输入内容和输出内容。

### 16.2 Android 自动检测

- 用户授权 Usage Access 后可以检测 AI App 使用事件。
- 可以根据 package name 匹配 AI 工具。
- 可以在打开 Murmur 时回补历史使用事件。
- 可以生成待补全会话。
- 未授权时展示清晰引导和能力限制。

### 16.3 浏览器扩展自动检测

- 可以识别 AI 网站域名。
- 可以记录活动标签页的 AI 使用时长。
- 标签切换、窗口失焦、页面关闭时会话状态正确。
- 可以本地保存会话。
- 不保存 prompt 和 AI 回复内容。

### 16.4 省力账本闭环

- 自动检测会话可以补全为 Ledger Entry。
- Ledger Entry 可以计算净收益。
- 今日页同时展示自动检测指标和净收益指标。
- 周报可以区分「自动检测到的使用」和「已补全的收益记录」。
- CSV 导出包含 detected sessions 和 ledger entries。

## 17. 当前 Figma 原型说明

当前 Figma 原型已经整理为单一完整入口。打开原始链接中的 `node-id=1-2` 会进入 `00 Complete Prototype Entry - Start Here` 页面，该页面排在文件第一位，并集中承载新版自动检测主线、旧版移动端归档和 QA Fixed 修复稿。

新版自动检测版 Figma 修改规格见：

[docs/FIGMA_AUTO_DETECTION_REVISION.md](docs/FIGMA_AUTO_DETECTION_REVISION.md)

同一个 Figma 文件中的页面结构：

- `00 Complete Prototype Entry - Start Here`：唯一主入口，对应原始链接的 `node-id=1-2`。
- `01 Source - Auto Detection PRD Prototype`：新版自动检测源画板。
- `02 Source - Legacy Mobile QA Fixed`：旧移动端 QA 修复源画板。

主入口中已整合的核心画板：

- `00 Auto Detection Overview`：新版产品结构总览。
- `01 macOS Dashboard - 自动检测仪表盘`：macOS 主账本和自动检测今日页。
- `02 Completion Inbox - 待补全会话`：自动检测会话收件箱。
- `03 Session Completion - 会话补全`：将 Detected Session 补全为 Ledger Entry。
- `04 Tool Catalog - 工具目录与识别规则`：豆包、DeepSeek、Kimi、ChatGPT、Claude、Cursor 等工具识别规则。
- `05 macOS Permissions - 检测权限引导`：macOS 前台 App 与窗口标题权限说明。
- `06 Android Permission - 使用情况访问授权`：Android Usage Access 授权引导。
- `07 Android Today - 移动 AI App 检测`：Android 端自动检测今日页。
- `08 Browser Extension Popup - 当前 AI 会话`：浏览器扩展 Popup。
- `09 Browser Extension Options - 域名与同步设置`：浏览器扩展配置页。
- `10 Detection Pipeline - 自动检测流程图`：Detected Session 到 Ledger Entry 的处理链路。

## 18. 开发前待确认问题

1. macOS 是否作为唯一主账本，浏览器扩展通过 Native Messaging 同步到 macOS，还是扩展也作为独立账本运行。
2. Android 数据是否需要和 macOS 同步。MVP 建议不同设备各自本地保存，先不做同步。
3. 是否允许浏览器扩展统计 prompt 发送次数。建议 P1，并且只计数，不保存内容。
4. Android 是否上架 Google Play。如果要上架，P0 不建议使用 AccessibilityService。
5. macOS 是否上架 Mac App Store。如果要上架，需要谨慎处理 Sandbox 和 Accessibility 权限说明。
6. Tool Catalog 是否允许远程更新。若坚持无服务器，则通过 App 更新和用户自定义规则更新。

## 19. 平台参考

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

## 20. License

See [LICENSE](LICENSE).
