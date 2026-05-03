# Murmur 第四次复审修复报告

> 基于 `docs/CODE_REVIEW_THIRD_RECHECK_REPORT_2026-05-04.md` 的修复实施记录  
> 修复日期：2026-05-04

## 判定结果

第四次复审共提出 11 项问题。经逐项判别：**修复 9 项，暂缓 2 项**。

| 编号 | 问题 | 判定 | 原因 |
|------|------|------|------|
| P0-1 | metadata 丢弃→窗口失焦不暂停 | ✅ 修复 | 时长高估 |
| P0-2 | 导航离开 AI 站旧 session 残留 | ✅ 修复 | 时长高估 |
| P0-3 | 浏览器无 LedgerEntry 创建入口 | ✅ 修复 | 核心闭环缺失 |
| P0-4 | Android/macOS 构建入口 | ⏸️ 暂缓 | 同前，需 IDE 工具 |
| P1-1 | UTC 日期→跨天数据错位 | ✅ 修复 | 数据归属错误 |
| P1-2 | 权限页不刷新 | ✅ 修复 | 授权后卡顿 |
| P1-3 | 检测间隔不重新调度 | ✅ 修复 | 设置不生效 |
| P1-4 | 前台服务无效开关 | ✅ 修复 | 死开关误导 |
| P1-5 | Android 账本 schema | ⏸️ 暂缓 | 同前，需专属 migration |
| P1-6 | Prompt Count 无闭环 | ⏸️ 暂缓 | 同前，功能设计缺口 |
| P2-1 | updateSession 时间类型不一致 | ✅ 修复 | 旧 session 覆盖 |
| P2-2 | icon32 复用 icon16 | ✅ 修复 | 显示模糊 |

---

## 修复详情

### P0-1 — metadata 被丢弃导致窗口失焦不暂停 session

**问题**：`createRawEvent()` 参数中有 `metadata`，但返回对象未包含该字段。`onWindowFocusChanged` 传入的 `{ focused: false }` 在 sessionizer 中永远为空，窗口失焦时 AI session 不会暂停，时长持续增长。

**文件**：`browser-extension/src/background/detector.js:62-76`

**修复**：
```js
// 返回对象增加 metadata 字段
return {
  eventId, platform, eventType, timestamp,
  appName: null, bundleId: null, packageName: null,
  domain, urlPattern, windowTitle: null,
  tabId, windowId,
  metadata,  // ← 新增
};
```

同时新增 `getLocalDateString(date, timeZone)` helper 函数用于本地日期转换。

---

### P0-2 — 导航离开 AI 网站时旧 session 不被结束

**问题**：用户从 `chatgpt.com` 切换到 `google.com` 时，`processEvent()` 只查新域名 `google.com` 是否有 active session（显然没有），不会处理旧域名 `chatgpt.com` 上的活跃 session。

**文件**：`browser-extension/src/background/detector.js`、`sessionizer.js`

**修复**：

1. **detector.js** — `onTabActivated`、`onTabUpdated`、`onNavigationCommitted` 三处均保存 `previousDomain` 并放入事件 metadata：
```js
const previousDomain = currentTab.domain;
// ... 更新 currentTab ...
const rawEvent = createRawEvent(EventType.TAB_ACTIVATED, ...,
  { previousDomain: previousDomain !== domain ? previousDomain : null });
```

2. **sessionizer.js** — `processEvent()` 中 TAB_ACTIVATED/TAB_UPDATED/NAVIGATION_COMMITTED 分支增加 previousDomain 处理：
```js
const prevDomain = rawEvent.metadata?.previousDomain;
if (prevDomain && prevDomain !== domain && activeSessions.has(prevDomain)) {
  const prevMatch = isAIDomain(prevDomain) ? await matchEvent(...) : ...;
  if (prevMatch.tool) {
    await endSession(prevDomain);
  }
}
```

---

### P0-3 — 浏览器无 LedgerEntry 创建入口

**问题**：点击"完成会话"只调用 `quickComplete` 结束 session，不收集补全字段、不创建 LedgerEntry。浏览器端无法产生"AI 省力账本"核心记录。

**文件**：`popup.html`、`popup.js`、`service-worker.js`、`popup.css`

**修复**：

1. **popup.html** — 新增补全表单 section（hidden by default），含：
   - 自动展示：工具名、域名、时长
   - 用户输入：估计节省时间（默认 15 分钟）、结果质量（下拉）、感受（下拉）
   - 操作按钮：保存 / 取消

2. **popup.js** — 重写 `onCompleteSession()`：不再直接结束，改为展示补全表单
   - 新增 `onSaveCompletion()`：收集表单数据 → 调用 `quickComplete` 结束 session → 构建 LedgerEntry（含 qualityScore/qualityPenalty/moodWeight 计算）→ 调用 `saveEntry` → 刷新状态
   - 新增 `onCancelCompletion()`：隐藏表单，恢复操作按钮

3. **service-worker.js** — 新增 `saveEntry` message handler：
   - 调用 `storage.saveEntry(entry)` 持久化
   - 调用 `storage.updateSession()` 将关联 session 状态设为 `completed`

4. **popup.css** — 新增补全表单样式

---

### P1-1 — UTC 日期导致跨天数据归属错误

**问题**：`new Date().toISOString().slice(0, 10)` 取 UTC 日期。对 Asia/Shanghai 用户，凌晨 0-8 点的记录会归入前一天。

**文件**：`sessionizer.js:48`、`service-worker.js:246,348`

**修复**：
- `sessionizer.js` `makeSession()`：`d.toLocaleDateString('en-CA')` 获取本地日期
- `service-worker.js`：`new Date().toLocaleDateString('en-CA')` 统一使用本地日期（2 处）
- `detector.js`：新增 `getLocalDateString(date, timeZone)` helper 供后续复用

---

### P1-2 — 权限页不自动刷新

**问题**：`remember { hasUsageStatsPermission(context) }` 只在首次组合时执行。用户跳转系统设置授权后返回，值不更新，仍停留 PermissionScreen。

**文件**：`MurmurNavigation.kt:57-59`

**修复**：
```kotlin
// before
val hasPermission = remember { hasUsageStatsPermission(context) }

// after
var hasPermission by remember { mutableStateOf(hasUsageStatsPermission(context)) }
val lifecycleOwner = LocalLifecycleOwner.current
DisposableEffect(lifecycleOwner) {
    val observer = LifecycleEventObserver { _, event ->
        if (event == Lifecycle.Event.ON_RESUME) {
            hasPermission = hasUsageStatsPermission(context)
        }
    }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
}
```

新增 import：`LocalLifecycleOwner`、`Lifecycle`、`LifecycleEventObserver`

---

### P1-3 — 检测间隔修改不重新调度 WorkManager

**问题**：`setDetectionInterval()` 只写 DataStore，已有 `MurmurApplication.rescheduleDetectionWorker()` 但无调用方。实际检测仍按初始 15 分钟运行。

**文件**：`SettingsViewModel.kt:93-96`

**修复**：
```kotlin
fun setDetectionInterval(minutes: Int) {
    viewModelScope.launch {
        settingsRepo.setDetectionIntervalMinutes(minutes)
        val app = getApplication<com.murmur.app.MurmurApplication>()
        app.rescheduleDetectionWorker(minutes)
    }
}
```

---

### P1-4 — 前台服务开关无实际效果

**问题**：设置页有前台服务开关，但 manifest 权限和 service 声明均已被注释。用户开启后不会获得任何效果。

**文件**：`SettingsScreen.kt:156-164`

**修复**：注释掉前台服务 toggle，标注 `// P1 — disabled until manifest permissions and service logic are implemented`

---

### P2-1 — updateSession 覆盖 ISO updatedAt 为 epoch

**问题**：`updateSession()` 强制写入 `updatedAt: Date.now()`（epoch number），与 shared schema 和 types.js 定义的 ISO 8601 字符串不一致。

**文件**：`storage.js:76-80`

**修复**：
```js
// before
sessions[index] = {
  ...sessions[index],
  ...updates,
  updatedAt: Date.now(),
};

// after
sessions[index] = {
  ...sessions[index],
  ...updates,
  updatedAt: updates.updatedAt || new Date().toISOString(),
};
```

---

### P2-2 — icon32 复用 16px 图片

**问题**：manifest 中 `"32": "icons/icon16.png"`，32px 场景使用 16px 图标放大显示模糊。

**文件**：`manifest.json:40`、`icons/icon32.png`（新建）

**修复**：
- Python 脚本生成 32x32 PNG（品牌色 #4F46E5，99 bytes）
- manifest 改为 `"32": "icons/icon32.png"`

---

## 构建验证

```
npm --prefix browser-extension run build
```

```
[Murmur Build] Validating source files...
  ✓ All 20 required files present.
[Murmur Build] Validating manifest.json...
  ✓ Icon files verified (PNG, size-object format)
  ✓ Action icon files verified
  ✓ manifest.json valid
[Murmur Build] Copying to dist/...
[Murmur Build] ✓ Build complete. Output: dist/
```

通过。

---

## 修复统计

| 平台 | P0 | P1 | P2 | 修改文件 | 新增文件 |
|------|----|----|----|---------|---------|
| Browser Extension | 3 | 1 | 2 | 7 | 1 |
| Android | 0 | 3 | 0 | 3 | 0 |
| **合计** | **3** | **4** | **2** | **10** | **1** |
