# Murmur 第四轮修复后代码复审报告

> 复审对象：`docs/CODE_REVIEW_FOURTH_FIX_REPORT_2026-05-04.md` 所描述的第四轮修复  
> 复审日期：2026-05-04  
> 复审范围：Browser Extension、Android、macOS、shared schema 对齐点  
> 复审方式：静态逐项核对 + 浏览器扩展 build 验证。未做业务代码变更。

## 总体结论

第四轮修复确实推进了几个关键问题：浏览器事件 `metadata` 已保留，previousDomain 已进入事件链路，Popup 已增加补全表单，Service Worker 也增加了 `saveEntry` handler；Android 权限页刷新、检测间隔重新调度、前台服务无效开关隐藏也都有对应代码；PNG icon32 已补齐，浏览器扩展 build 通过。

但当前仍不能判定为可验收。最关键的问题是：浏览器 Popup 的“保存补全”路径会在运行时直接抛错，因为 Popup 页面没有加载 `SourcePlatform`，`SourcePlatform?.BROWSER` 在未声明变量上仍会触发 `ReferenceError`。此外，本地日期修复不完整，`getSessionsByDate()` 仍按 UTC 字符串截取 `startedAt`，所以今日统计在跨时区边界仍会错。浏览器补全表单也只是“最小记录入口”，没有收集 PRD 要求的 Prompt/审核/修改/查错/返工分钟等关键字段。

## 已确认修复

### Browser Extension

- `createRawEvent()` 已返回 `metadata` 字段：`browser-extension/src/background/detector.js:62-77`。
- `onTabActivated()`、`onTabUpdated()`、`onNavigationCommitted()` 已传入 `previousDomain`：`browser-extension/src/background/detector.js:113-119`、`browser-extension/src/background/detector.js:134-143`、`browser-extension/src/background/detector.js:185-196`。
- `processEvent()` 已在主要导航事件中处理 previous domain，并结束旧 AI session：`browser-extension/src/background/sessionizer.js:247-258`。
- Popup 已增加补全表单：`browser-extension/src/popup/popup.html:57-101`。
- Service Worker 已增加 `saveEntry` message handler，并尝试把关联 session 标记为 `completed`：`browser-extension/src/background/service-worker.js:491-505`。
- `updateSession()` 已保持 ISO `updatedAt`：`browser-extension/src/shared/storage.js:70-80`。
- manifest 的 action icon 32px 已改为 `icons/icon32.png`，并且文件存在且为 32x32 PNG：`browser-extension/manifest.json:39-43`。

### Android

- `MurmurNavigation` 已改为在 lifecycle `ON_RESUME` 重新检查 Usage Access 权限：`android/app/src/main/java/com/murmur/app/ui/navigation/MurmurNavigation.kt:59-71`。
- 检测间隔保存后会调用 `MurmurApplication.rescheduleDetectionWorker(minutes)`：`android/app/src/main/java/com/murmur/app/ui/settings/SettingsViewModel.kt:93-99`。
- 前台服务开关已从设置 UI 中注释隐藏，避免用户打开无效功能：`android/app/src/main/java/com/murmur/app/ui/settings/SettingsScreen.kt:156-164`。

## P0 / 阻断问题

### P0-1 Browser：补全保存路径会因 `SourcePlatform` 未定义而崩溃

**位置**

- `browser-extension/src/popup/popup.html:141`
- `browser-extension/src/popup/popup.js:319-323`
- `browser-extension/src/shared/enums.js:8-12`

**问题**

Popup 页面只加载了：

```html
<script src="popup.js"></script>
```

没有加载 `shared/enums.js`。但保存补全时构建 entry 使用：

```js
sourcePlatform: SourcePlatform?.BROWSER || 'browser',
```

在 JavaScript 中，对未声明变量使用 optional chaining 仍会抛 `ReferenceError`。也就是说，用户点击“保存”后会在构建 entry 时直接中断，后续 `sendMessage('saveEntry')` 不会执行。

**影响**

- 第四轮新增的 LedgerEntry 创建入口不可用。
- 用户点击“完成会话 -> 保存”无法真正生成账本记录。
- 今日统计里的 `已记录` 仍不会可靠增长。

**建议**

最小修复是直接使用字面量：

```js
sourcePlatform: 'browser',
```

或者在 popup.html 中显式加载 enums：

```html
<script src="../shared/enums.js"></script>
<script src="popup.js"></script>
```

但考虑 Popup 只需要一个固定平台值，直接使用 `'browser'` 更简单。

### P0-2 Android / macOS：仍无法做工程级构建验证

**位置**

- Android：未找到 `android/gradlew`、`gradle-wrapper.jar`、`gradle-wrapper.properties`
- macOS：未找到 `.xcodeproj`、`.xcworkspace`、`.pbxproj`、`Package.swift`

**问题**

第四轮继续暂缓构建入口。当前浏览器端可以 build，但 Android 和 macOS 仍无法通过仓库内命令验证编译。

**影响**

- Android 权限刷新、WorkManager 调度等 Kotlin 修改无法确认编译通过。
- macOS 仍无法确认 target、资源、权限、Native Messaging host 等工程配置。
- “三端完成”仍缺少最基本的可复现验收入口。

**建议**

- Android 补齐 wrapper 并提供 `./gradlew :app:assembleDebug`。
- macOS 补齐 Xcode project/workspace 或 Swift Package，并提供构建命令。

## P1 / 高风险问题

### P1-1 Browser：本地日期修复不完整，今日统计仍会跨时区错位

**位置**

- `browser-extension/src/background/sessionizer.js:47-69`
- `browser-extension/src/background/service-worker.js:245-249`
- `browser-extension/src/shared/storage.js:94-101`
- `browser-extension/src/shared/storage.js:216-219`
- `browser-extension/src/options/options.js:323-356`

**问题**

第四轮把新 session 的 `localDate` 和 Service Worker 的 `today` 改成了本地日期：

```js
new Date().toLocaleDateString('en-CA')
```

但 `getSessionsByDate()` 仍然忽略 session 自带的 `localDate`，继续从 `startedAt` 截取日期：

```js
const d = s.startedAt || s.startTime;
const datePart = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
```

`startedAt` 是 ISO UTC 字符串，`slice(0, 10)` 仍然是 UTC 日期。于是 Service Worker 传入本地日期后，storage 层仍按 UTC 日期过滤。

另外，`getTodaySummary()`、Options 导出文件名、csv-exporter 默认日期、`crossesMidnight()` 仍有 `toISOString().slice(0, 10)` 残留。

**影响**

以 Asia/Shanghai 为例，凌晨 00:00-07:59 的 session：

- `session.localDate` 是当天；
- `startedAt.slice(0,10)` 可能是前一天；
- `getSessionsByDate(today)` 查不到这条 session；
- Popup 今日统计、Options 导出、周边汇总仍会错。

**建议**

`getSessionsByDate()` 应优先使用 `s.localDate`：

```js
return sessions.filter((s) => {
  if (s.localDate) return s.localDate === dateStr;
  ...
});
```

并集中提供一个 `getLocalDateString()` helper 给 sessionizer、service-worker、storage、options、csv-exporter、weekly-review 复用。

### P1-2 Browser：补全 entry 缺失 session 关键字段，toolId 会被保存为空

**位置**

- `browser-extension/src/background/service-worker.js:260-269`
- `browser-extension/src/popup/popup.js:319-324`

**问题**

`getStatus` 返回给 Popup 的 `currentSession` 只有：

```js
id, toolName, domain, startTime, duration, status
```

没有返回 `toolId`、`sourcePlatform`、`localDate`、`timezone` 等字段。但 Popup 构建 entry 时使用：

```js
toolId: completionSessionData.toolId || '',
toolName: completionSessionData.toolName || '',
```

因此即使修复了 `SourcePlatform` 崩溃，保存出来的 LedgerEntry 也会丢失 `toolId`。

**影响**

- Entry 与工具目录无法可靠关联。
- 按工具统计、周报“最有价值工具/最亏时间工具”等分析会缺失数据。
- CSV 导出中工具 ID 为空。

**建议**

`getStatus.currentSession` 应返回补全 entry 所需字段，至少包括：

```js
toolId,
sourcePlatform,
sourceKind,
localDate,
timezone,
rawDomain,
rawUrlPattern
```

或者 Popup 保存时直接使用 `quickComplete` 返回的完整 session 构建 entry，而不是用简化后的 `completionSessionData`。

### P1-3 Browser：补全表单没有收集 PRD 要求的成本拆分字段

**位置**

- `browser-extension/src/popup/popup.html:73-94`
- `browser-extension/src/popup/popup.js:308-346`
- `shared/schemas/ledger-entry.schema.json:19-55`

**问题**

当前补全表单只让用户填写：

- 估计节省时间
- 结果质量
- 感受

但 PRD 和 shared schema 的核心公式需要：

```text
prompt_minutes
review_minutes
edit_minutes
debug_minutes
rework_minutes
```

当前代码把这些关键字段硬编码：

```js
const promptMinutes = Math.min(durationMinutes || 5, 5);
const reviewMinutes = 5;
editMinutes: 0,
debugMinutes: 0,
reworkMinutes: 0,
useCaseId: 'other',
useCaseName: '其他',
note: null,
```

**影响**

- 浏览器端虽然能创建 LedgerEntry，但不是用户真实记录的 AI 成本。
- “AI 净收益 = 估计节省 - Prompt - 审核 - 修改 - 查错 - 返工”仍没有在浏览器端被真实执行。
- 复杂任务、返工、查错等核心洞察无法从用户输入中得出。

**建议**

补全表单至少增加：

- 用途选择
- Prompt 分钟
- 审核分钟
- 修改分钟
- 查错分钟
- 返工分钟
- 可选备注

并使用已有 `calculateEntry()` 或等价共享逻辑计算 `totalExtraCostMinutes`、`netGainMinutes`、`hasRework`。

### P1-4 Browser：保存失败不会反馈，Popup 会直接隐藏表单

**位置**

- `browser-extension/src/popup/popup.js:348-353`
- `browser-extension/src/background/service-worker.js:491-505`
- `browser-extension/src/shared/storage.js:139-157`

**问题**

Popup 保存 entry 时没有检查响应：

```js
await sendMessage('saveEntry', { entry });
document.getElementById('completionSection').style.display = 'none';
completionSessionData = null;
stopTimer();
await refreshStatus();
```

同时 `storage.saveEntry()` 内部 catch 后只打印错误，不向上抛出：

```js
} catch (err) {
  console.error('[Murmur Storage] Failed to save entry:', err);
}
```

这会让 Service Worker 很容易返回成功，或者 Popup 即使收到失败也继续关闭表单。

**影响**

- 用户以为保存成功，实际 entry 可能没写入。
- session 可能已被 `quickComplete` 结束，但对应账本记录丢失。

**建议**

- `saveEntry()` 失败时应抛出错误或返回 `{ success:false }`。
- Popup 必须检查 `saveResp.success`，失败时保留表单并显示错误。
- 最好先保存 entry 成功后再关闭表单。

### P1-5 Android：权限刷新修复存在编译验证风险

**位置**

- `android/app/src/main/java/com/murmur/app/ui/navigation/MurmurNavigation.kt:14-16`

**问题**

新增代码使用：

```kotlin
import androidx.compose.ui.platform.LocalLifecycleOwner
```

项目依赖中已有 `androidx.lifecycle:lifecycle-runtime-compose`，常见 Compose 用法是从 lifecycle compose 包使用 `LocalLifecycleOwner`。由于 Android 端仍没有 Gradle wrapper，当前无法确认这个 import 在项目使用的 Compose/Lifecycle 版本组合下是否可编译。

**影响**

- 权限页修复可能在 Android 编译阶段失败。
- 当前只能静态判断逻辑方向正确，不能完成工程级确认。

**建议**

补齐 Android 构建入口后第一时间执行 `assembleDebug`。若编译失败，将 import 调整为版本实际提供的包路径。

## P2 / 质量与一致性问题

### P2-1 Browser：UTC 日期残留还存在于导出文件名和跨午夜判断

**位置**

- `browser-extension/src/export/csv-exporter.js:126-135`
- `browser-extension/src/options/options.js:323-356`
- `browser-extension/src/background/sessionizer.js:228-231`

**问题**

这些位置仍使用 `toISOString().slice(0,10)`。它们不一定直接影响核心统计，但会造成导出文件名、跨午夜判断与本地日期不一致。

**建议**

统一替换为本地日期 helper，避免同一扩展里同时存在 UTC 日期和本地日期两套规则。

### P2-2 Browser：manifest 顶层 icons 未包含 32px

**位置**

- `browser-extension/manifest.json:48-52`

**问题**

`action.default_icon` 已包含 32px，但顶层 `icons` 仍只有 16/48/128。Chrome 常用顶层尺寸是 16/48/128，这不一定阻断发布；但既然已经生成 `icon32.png`，保持两处尺寸集合一致更清晰。

**建议**

可在顶层 `icons` 里也加入：

```json
"32": "icons/icon32.png"
```

## 构建与验证结果

### 已执行

```bash
npm --prefix browser-extension run build
```

结果：通过。

```text
[Murmur Build] Validating source files...
  ✓ All 20 required files present.
[Murmur Build] Validating manifest.json...
  ✓ Icon files verified (PNG, size-object format)
  ✓ Action icon files verified
  ✓ manifest.json valid
[Murmur Build] Copying to dist/...
[Murmur Build] ✓ Build complete. Output: dist/
```

```bash
rg -n "MOBILE_APP|FOREGROUND_APP|SessionStatus\\.ACTIVE|NEEDS_COMPLETION|SUSPECTED_ABANDONED|\\\"ACTIVE\\\"|\\\"SUSPECTED\\\"|\\\"COMPLETED\\\"|\\\"MERGED\\\"|status = 'ACTIVE'|status = 'SUSPECTED'|status = 'COMPLETED'|status = 'MERGED'" android/app/src/main/java browser-extension/src macos/Murmur -S
```

结果：未检出旧枚举或旧状态字符串残留。

### 未能执行

- Android：缺少 `gradlew`，当前环境也没有可用 `gradle` 命令，无法执行 `assembleDebug`。
- macOS：缺少 Xcode project/workspace 或 Swift Package，无法执行构建验证。
- Browser Popup 保存路径：项目 build 脚本不会执行 Popup 交互路径，`SourcePlatform` 运行时问题需要浏览器交互或自动化测试覆盖。

## 建议修复顺序

1. 先修 Popup 保存崩溃：把 `SourcePlatform?.BROWSER` 改为 `'browser'`，并补一条保存补全的浏览器端交互测试。
2. 修 `getSessionsByDate()`，优先使用 `session.localDate`，彻底消除今日统计跨时区错位。
3. 扩展 `getStatus.currentSession` 返回完整 session 字段，或用 `quickComplete` 返回的完整 session 构建 entry。
4. 把补全表单补齐到 PRD 成本拆分字段，而不是硬编码 Prompt/审核时间。
5. 让 `saveEntry()` 失败可被感知，Popup 保存失败时保留表单。
6. 补齐 Android/macOS 构建入口，再验证 Android 权限刷新和 WorkManager 调度修改是否编译通过。

## 复审结论

第四轮修复方向是对的，尤其是浏览器自动检测时长高估问题已经开始被系统性处理；但 LedgerEntry 补全入口当前有运行时崩溃，且日期统计修复没有贯穿 storage 层，所以仍不能验收为“浏览器账本闭环完成”。Android 设置体验修复静态看起来合理，但仍受制于缺少构建入口，无法给出编译通过结论。
