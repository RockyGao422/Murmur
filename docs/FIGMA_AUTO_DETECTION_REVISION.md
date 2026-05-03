# Murmur 自动检测版 Figma 原型修改说明

本文档是对现有 Figma 文件的 review 和新版修改规格。当前 Figma 文件：

[Murmur AI 省力账本 - Mobile PRD Prototype](https://www.figma.com/design/7PGVYEttzthUwNOhVDgFym)

当前 Figma 文件已按本文档完成新版自动检测原型修改，并已整理为单一完整入口。原始链接中的 `node-id=1-2` 已改为 `00 Complete Prototype Entry - Start Here`，打开后即可从同一个 Page 查看新版自动检测主线、旧版移动端归档和 QA Fixed 修复稿。

当前页面结构：

- `00 Complete Prototype Entry - Start Here`：唯一主入口，对应原始 `node-id=1-2`。
- `01 Source - Auto Detection PRD Prototype`：新版自动检测源画板。
- `02 Source - Legacy Mobile QA Fixed`：旧移动端 QA 修复源画板。

详细视觉 QA 与旧版画板问题清单见：

[FIGMA_QA_REVIEW.md](FIGMA_QA_REVIEW.md)

## 1. 当前 Figma 原型 Review

### 1.1 当前原型仍停留在旧版方向

现有 Figma 原型主要是移动端手动记录产品：

- Onboarding
- Today
- Quick Record
- Entry Detail
- Saved Result
- Stats
- Tools
- Tool Detail
- Weekly Review
- Settings

这些画板适合旧版「用户主动记录一次 AI 使用」的产品方向，但已经不匹配新版 PRD。

新版 PRD 的核心已经变成：

- macOS / Android / 浏览器扩展。
- iOS 暂不支持。
- 自动检测 AI 使用会话。
- 通过 Tool Catalog 识别豆包、DeepSeek、Kimi、ChatGPT、Claude、Cursor 等工具。
- 生成待补全会话。
- 用户补全会话后才生成省力账本记录。
- 今日页需要同时展示「自动检测指标」和「已补全收益指标」。

### 1.2 当前原型需要保留的部分

建议保留旧画板，不要删除。原因：

- Quick Record 的时间成本、质量、感受字段仍可复用到「会话补全页」。
- Today 的净收益和疲劳指数卡片可复用到新版仪表盘。
- Saved Result 的反馈逻辑仍适用于会话补全成功后。
- Weekly Review 的复盘卡片仍可作为新版周报样式参考。

### 1.3 当前原型需要废弃或改造的部分

需要废弃：

- iOS 手机主 App 作为第一端形态。
- 「打开 App → 点记录一次」作为唯一主流程。
- Tab 中没有「待补全」入口。
- 工具页只展示统计，不展示识别规则。

需要改造：

- Quick Record 改为 Session Completion。
- Today 改为 Auto Detection Dashboard。
- Tools 改为 Tool Catalog。
- Settings 增加检测权限、浏览器扩展连接状态、暂停检测。

### 1.4 旧版 06 Stats 画板已发现缺陷

旧版 `06 Stats - 统计趋势` 画板存在一个明确视觉缺陷：

- 「复杂方案生成」排行卡片位置过低，覆盖或贴近底部 Tab Bar。
- 「复杂方案生成」中的「复杂」两个字在窄文本框中显示异常，视觉上像被挤压或断行。
- 根因是场景排行区域从 `y=638` 开始，两条列表项分别位于 `y=672` 和 `y=740`，第二条高度为 `58`，底部到达 `798`，而底部 Tab Bar 从 `y=768` 开始，因此必然发生覆盖。

修复规格：

- 将「场景排行」标题从 `y=638` 上移到 `y=626`。
- 将第一条「代码解释」卡片从 `y=672` 上移到 `y=656`。
- 将第二条「复杂方案生成」卡片从 `y=740` 上移到 `y=718`。
- 将两条排行卡片高度从 `58` 缩减到 `54`。
- 第二条卡片底部应为 `718 + 54 = 772`，仍略贴近 Tab Bar。若视觉上仍紧，应进一步把排行区域整体上移 8px，即标题 `y=618`、第一条 `y=648`、第二条 `y=710`。
- 推荐最终安全版本：标题 `y=618`、第一条 `y=648`、第二条 `y=710`、卡片高度 `52`，确保第二条底部 `762`，与 Tab Bar `y=768` 保留 6px 间距。
- 「复杂方案生成」文本框宽度保持不少于 `190`，字号从 `14` 降到 `13`，line height 固定为 `17`，避免中文词组显示异常。

## 2. Figma 文件结构修改

在现有 Figma 文件中新增页面：

```text
Auto Detection PRD Prototype
```

旧页面保留并重命名为：

```text
Legacy Mobile Manual Entry Prototype
```

如果无法重命名旧页面，也至少在新版页面的 Overview 中标注：

```text
旧移动端原型仅作为历史参考，新版以 macOS / Android / 浏览器扩展自动检测为准。
```

## 3. 新版原型画板清单

新版至少需要 11 个画板。

| 编号 | 画板名称 | 尺寸 | 用途 |
| --- | --- | --- | --- |
| 00 | Auto Detection Overview | 760 x 860 | 解释新版核心对象和检测管线 |
| 01 | macOS Dashboard | 1360 x 860 | macOS 主仪表盘 |
| 02 | Completion Inbox | 1360 x 860 | 待补全会话收件箱 |
| 03 | Session Completion | 1360 x 860 | 自动会话补全为账本记录 |
| 04 | Tool Catalog | 1360 x 860 | 工具目录与识别规则 |
| 05 | macOS Permissions | 1360 x 860 | macOS 检测权限引导 |
| 06 | Android Permission | 390 x 844 | Android 使用情况访问授权 |
| 07 | Android Today | 390 x 844 | Android 今日检测页 |
| 08 | Browser Extension Popup | 360 x 560 | 浏览器扩展 Popup |
| 09 | Browser Extension Options | 760 x 560 | 浏览器扩展设置 |
| 10 | Detection Pipeline | 1200 x 640 | 自动检测数据流 |

## 4. 设计 Tokens

新版沿用旧版的安静工作型视觉，但要更偏桌面生产力工具。

| Token | Hex | 用途 |
| --- | --- | --- |
| bg | `#F6F4EE` | 页面背景 |
| panel | `#FFFFFF` | 卡片 |
| ink | `#17211D` | 主文本 |
| muted | `#68736D` | 次级文本 |
| faint | `#A8B0AA` | 弱文本 |
| line | `#DDE4DC` | 边框 |
| green | `#1E8A5E` | 正收益、已启用 |
| greenSoft | `#E6F4ED` | 正向背景 |
| blue | `#276EF1` | 自动检测、平台信息 |
| blueSoft | `#EAF0FF` | 检测背景 |
| amber | `#B76E00` | 待补全、权限提示 |
| amberSoft | `#FFF2D7` | 警示背景 |
| red | `#D2483D` | 负收益、忽略、删除 |
| redSoft | `#FFE9E7` | 负向背景 |
| purple | `#6E56CF` | 合并、工具目录、规则 |
| purpleSoft | `#F0EDFF` | 规则背景 |
| dark | `#131B18` | 主按钮 |

组件规则：

- 桌面卡片圆角 8。
- 桌面窗口圆角 18。
- 手机画板圆角 32。
- 浏览器 Popup 圆角 18。
- 主按钮使用 dark。
- 待补全使用 amber。
- 自动检测使用 blue。
- 识别规则和合并建议使用 purple。
- 正收益和已完成使用 green。
- 忽略、负收益、删除使用 red。

## 5. 画板 00：Auto Detection Overview

### 目标

让团队一眼理解新版产品已经从手动记录变成自动检测。

### 内容

标题：

```text
Murmur
自动检测版 · macOS / Android / 浏览器扩展
```

说明文案：

```text
新版原型把核心对象从手动记录改为自动检测会话：系统识别 AI App 或 AI 网站，生成待补全会话，用户再补全用途、质量和返工成本。
```

三张核心卡片：

1. 自动检测对象：Session  
   工具、平台、开始结束、活跃时长、置信度。

2. 省力账本对象：Entry  
   用途、节省时间、返工、质量、感受。

3. 隐私边界：No content  
   不读取 Prompt、不读取 AI 输出、不截图。

流程：

```text
Detector → Matcher → Sessionizer → Completion → Review
```

每步说明：

- Detector：前台 App / 使用事件 / AI 域名。
- Matcher：Tool Catalog 识别豆包、DeepSeek 等。
- Sessionizer：切分、合并、忽略、低置信度。
- Completion：用户 5 秒补全 ROI 字段。
- Review：今日、统计、周报、CSV。

## 6. 画板 01：macOS Dashboard

### 目标

macOS 是主账本和主仪表盘，今日页必须同时展示自动检测和省力收益。

### 布局

尺寸：1360 x 860。

左侧 Sidebar：

- Murmur Logo。
- 副标题：AI 使用自动检测。
- 导航：
  - 今日
  - 待补全
  - 统计
  - 工具目录
  - 复盘
  - 设置
- 检测状态：
  - macOS App 检测开启。
  - 浏览器扩展已连接。
  - 窗口标题权限未开启。
- 按钮：暂停检测 1 小时。

主区域顶部：

- 标题：今日。
- 副标题：2026.05.03 · 自动检测版。

四张指标卡：

1. AI 使用时长：`2h 18m`  
   自动检测 · App + Web。

2. 检测会话：`18`  
   待补全 7 · 已补全 11。

3. 今日净收益：`+42m`  
   仅统计已补全记录。

4. 疲劳指数：`72`  
   高切换 · 待补全堆积。

中部左侧：最近自动检测会话

列表项：

- DeepSeek · chat.deepseek.com  
  Browser · 10:12-10:26 · 14m · 置信度 95%  
  状态：待补全。

- 豆包 · App  
  macOS · 09:40-10:05 · 25m · App 名称匹配  
  状态：已补全。

- Cursor · App  
  macOS · 08:50-09:30 · 40m · bundle id  
  状态：+35m。

中部右侧：检测质量

说明：

```text
自动检测只能判断「什么时候用了哪个 AI」，净收益和返工仍需要用户补全。
```

状态：

- 低置信度会话 2 条，需要确认工具。
- 忽略规则 5 条，避免误识别。
- 未保存 Prompt 和 AI 输出内容。

底部：今日洞察

文案：

```text
你今天在 4 个 AI 工具之间切换 9 次。DeepSeek 和豆包的待补全会话较多，补全后才能判断真实省力收益。
```

按钮：

- 打开待补全。
- 查看隐私边界。

## 7. 画板 02：Completion Inbox

### 目标

这是新版产品最关键的新页面。用户不是从零记录，而是处理自动检测出来的会话。

### 筛选器

- 全部 7。
- 低置信度 2。
- 建议合并 3。
- 已忽略 5。

### 列表字段

每条会话显示：

- 工具名称。
- 来源平台。
- 来源 App 或域名。
- 活跃时长。
- 时间段。
- 置信度。
- 状态。
- 操作按钮。

### 示例列表

1. DeepSeek · chat.deepseek.com  
   Browser · 14m · 10:12-10:26 · 置信度 95%  
   操作：补全。

2. 豆包 · macOS App  
   App · 25m · 09:40-10:05 · App 名称匹配  
   操作：补全。

3. Kimi · kimi.moonshot.cn  
   Browser · 9m · 09:12-09:21 · 建议与下一段合并  
   操作：合并。

4. Kimi · kimi.moonshot.cn  
   Browser · 6m · 09:23-09:29 · 间隔 2m  
   操作：合并。

5. 未知应用 · AI Studio  
   macOS · 18m · 置信度 56% · 需要确认  
   操作：确认工具。

6. ChatGPT · chatgpt.com  
   Browser · 4m · 低时长会话  
   操作：忽略。

右侧说明卡：

标题：会话处理规则。

文案：

```text
同工具、同平台、间隔小于 3 分钟的会话会进入建议合并。低于 0.7 置信度的会话需要用户确认工具。
```

按钮：

- 批量补全默认值。
- 批量忽略低时长。
- 管理忽略规则。

## 8. 画板 03：Session Completion

### 目标

把自动检测会话补全为可计算 ROI 的 Ledger Entry。

### 左侧自动检测信息

卡片标题：

```text
自动检测信息
```

字段：

```text
工具：DeepSeek
平台：Browser · chat.deepseek.com
时间：10:12-10:26 · 活跃 14m
置信度：95% · 不保存完整 URL
```

隐私提示卡：

```text
Murmur 只保存 DeepSeek 这个工具、域名、时间和用户补全字段。不会保存 Prompt、AI 输出、完整 URL query 或页面正文。
```

### 右侧省力账本字段

标题：

```text
省力账本字段
```

用途 chips：

- 代码，默认选中。
- 写作。
- 搜索。
- 学习。
- 其他。

时间成本：

- 估计节省时间：30m。
- Prompt 时间：5m。
- 审核时间：5m。
- 修改/查错/返工：10m。

结果质量：

- 可直接用。
- 需小改，默认选中。
- 大改。
- 没用。

底部：

- 本次净收益 +10m。
- 保存为账本记录。

## 9. 画板 04：Tool Catalog

### 目标

解释 Murmur 如何识别 DeepSeek、豆包、Kimi 等工具，并允许用户修正识别规则。

### 左侧默认工具列表

示例：

- DeepSeek  
  domain: chat.deepseek.com · App name: DeepSeek  
  状态：启用。

- 豆包  
  domain: doubao.com · App name: 豆包  
  状态：启用。

- Kimi  
  domain: kimi.moonshot.cn  
  状态：启用。

- ChatGPT  
  domain: chatgpt.com · bundle/package 待验证  
  状态：启用。

- Cursor  
  macOS bundle id · App name: Cursor  
  状态：启用。

- 未知 AI Studio  
  用户映射 · 置信度 100%  
  状态：自定义。

### 右侧规则详情

标题：

```text
DeepSeek 识别规则
```

规则表：

| 类型 | 规则 | 置信度 |
| --- | --- | --- |
| Browser domains | deepseek.com, chat.deepseek.com | 95% |
| URL patterns | `*://chat.deepseek.com/*` | 90% |
| macOS App name | DeepSeek | 85% |
| Android package | 待验证，用户可添加 | -- |
| Window title | DeepSeek，仅授权后启用 | 65% |

按钮：

- 添加规则。
- 忽略此工具。

## 10. 画板 05：macOS Permissions

### 目标

解释 macOS 自动检测能力和隐私边界。

### 三张状态卡

1. 前台 App 检测：开启  
   识别当前使用哪个 AI App。

2. 窗口标题识别：可选  
   提高网页封装 App 识别准确率。

3. 浏览器扩展：未连接  
   网页 AI 检测建议安装扩展。

### 隐私边界区块

标题：

```text
Murmur 不会做这些事
```

列表：

- 不读取 Prompt 内容。
- 不读取 AI 输出内容。
- 不截图、不录屏。
- 不监听键盘输入。
- 不保存完整敏感 URL。

按钮：

- 开启窗口标题识别。
- 稍后再说。

## 11. 画板 06：Android Permission

### 目标

解释 Android 使用情况访问权限。

### 顶部

标题：

```text
开启自动检测
```

说明：

```text
Murmur 需要「使用情况访问」权限来识别豆包、DeepSeek 等 AI App 的前台使用时间。
```

### 会检测什么

```text
App 名称、包名、开始结束时间和使用时长。
```

### 不会检测什么

```text
不读取 Prompt、不读取 AI 回复、不截图、不监听输入。
```

### 默认支持

```text
DeepSeek、豆包、Kimi、通义千问、文心一言、ChatGPT 等
```

按钮：

- 去系统设置开启权限。
- 暂不开启，仅查看历史。

## 12. 画板 07：Android Today

### 目标

展示 Android 端自动检测 AI App 使用。

### 指标卡

1. AI App 使用：1h 12m  
   自动回补检测。

2. 待补全：4  
   补全后计算净收益。

3. 今日净收益：+18m  
   已补全 3 条。

4. 疲劳指数：61  
   夜间使用 2 次。

### 检测列表

- 豆包 · Android App  
  13:20-13:42 · 22m · package match  
  状态：待补全。

- DeepSeek · Android App  
  10:18-10:40 · 22m · package match  
  状态：+18m。

- Kimi · Android App  
  09:10-09:18 · 8m  
  状态：待补全。

按钮：

- 回补最近 24 小时。
- 打开待补全。

## 13. 画板 08：Browser Extension Popup

### 目标

浏览器扩展的小弹窗用于当前 AI 网页会话检测和快速处理。

### 顶部

- Murmur。
- 状态：检测中。

### 当前会话卡

```text
DeepSeek
chat.deepseek.com · 当前会话 14m
只保存域名、时间和工具，不保存 Prompt。
```

### 指标

- 今日网页 AI：52m，3 个网站。
- 待补全：5，含当前会话。

按钮：

- 补全当前会话。
- 暂停检测 1 小时。
- 忽略此域名。

底部状态：

```text
已连接 macOS App
```

## 14. 画板 09：Browser Extension Options

### 目标

管理 AI 域名、同步和隐私设置。

### 左侧 AI 域名

- chatgpt.com
- claude.ai
- chat.deepseek.com
- doubao.com
- kimi.moonshot.cn

每项显示：

```text
已启用检测
ON
```

### 右侧同步与隐私

状态：

- Native Messaging：已连接。
- 不保存完整 URL query。
- 不注入非 AI 网站。
- Prompt 次数检测：关闭。

按钮：

- 导出扩展数据。
- 清空扩展数据。

## 15. 画板 10：Detection Pipeline

### 目标

给开发和设计明确自动检测的数据流。

### 节点

第一行：

1. macOS Detector  
   NSWorkspace，前台 App 切换。

2. Android Detector  
   UsageStatsManager，前台使用事件。

3. Browser Detector  
   tabs + webNavigation，AI 域名访问。

4. Tool Matcher  
   Tool Catalog，包名 / 域名 / 标题。

第二行：

5. Sessionizer  
   开始 / 结束，合并 / 忽略。

6. Detected Session  
   pending / suspected / completed / ignored。

7. Ledger Entry  
   用户补全 ROI 字段。

8. Review Engine  
   今日 / 统计 / 周报。

连线：

```text
Detector → Tool Matcher → Sessionizer → Detected Session → Ledger Entry → Review Engine
```

## 16. 新版原型交互热点

后续写入 Figma 时建议加以下交互：

- macOS Dashboard 的「打开待补全」跳转 Completion Inbox。
- Completion Inbox 的「补全」跳转 Session Completion。
- Session Completion 的「保存为账本记录」跳回 macOS Dashboard。
- Tool Catalog 的「添加规则」打开规则新增弹层，P1 可先不画。
- macOS Permissions 的「开启窗口标题识别」跳到系统权限说明。
- Android Permission 的「去系统设置开启权限」跳到 Android Today 的授权成功状态。
- Browser Popup 的「补全当前会话」跳到 Session Completion。
- Browser Options 的「清空扩展数据」打开确认弹窗。

## 17. 需要从旧原型迁移的组件

可复用：

- MetricCard。
- EntryRow。
- PillSelector。
- TimeSlider。
- PrimaryButton。
- GhostButton。
- InsightCard。

需要新增：

- DetectionStatusRow。
- SessionRow。
- ConfidenceBadge。
- PlatformBadge。
- PermissionCard。
- ToolRuleRow。
- BrowserPopupMetric。
- PipelineNode。

## 18. 修改完成后的验收标准

Figma 修改完成后应满足：

- 文件第一位是 `00 Complete Prototype Entry - Start Here` 主入口页，并对应原始 `node-id=1-2`。
- 主入口页中整合新版自动检测画板、旧版移动端归档和 QA Fixed 修复稿。
- 文件中保留 `01 Source - Auto Detection PRD Prototype` 源页面。
- 文件中保留 `02 Source - Legacy Mobile QA Fixed` 源页面。
- 至少包含 11 个新版画板。
- 旧移动端原型未被删除。
- 新画板明确标注 iOS 暂不支持。
- 新画板包含 macOS、Android、Browser Extension 三端。
- 新画板包含「待补全会话」核心页面。
- 新画板包含 Tool Catalog。
- 新画板说明自动检测不读取 Prompt 和 AI 输出。
- 新画板体现 Detected Session 和 Ledger Entry 的双层模型。
- 新画板中的今日页同时展示自动检测指标和净收益指标。

## 19. 本次执行结果

本次已在 Figma 文件中完成：

1. 新建并保留 `01 Source - Auto Detection PRD Prototype` 源页面。
2. 保留旧页面，不删除历史移动端原型。
3. 创建 11 个新版画板，覆盖 macOS、Android、浏览器扩展和自动检测流程。
4. 新增并保留 `02 Source - Legacy Mobile QA Fixed` 源页面，修复旧版 `03 Quick Record` 和 `06 Stats` 的重点布局问题。
5. 完成截图级 QA：确认 `06 Stats` 中 `复杂方案生成` 卡片不再覆盖底部栏，文本展示正常。
6. 扫描并修复异常高饱和蓝色 `#000fff`，将页面背景、侧边栏、底部栏和主按钮文字恢复为正确语义颜色。
7. 将原始 `node-id=1-2` 所在页面整理为 `00 Complete Prototype Entry - Start Here`，并复制整合新版自动检测画板与 QA Fixed 画板，作为唯一完整入口。
8. 将主入口页中的旧版 `03 Quick Record` 与 `06 Stats` 替换为 QA Fixed 版本，避免归档区继续出现已知布局缺陷。
