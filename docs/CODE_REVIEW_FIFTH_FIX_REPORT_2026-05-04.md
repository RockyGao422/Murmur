# Murmur 第五次复审修复报告

> 基于 `docs/CODE_REVIEW_FOURTH_RECHECK_REPORT_2026-05-04.md` 的修复实施记录  
> 修复日期：2026-05-04

## 判定结果

第五次复审共提出 9 项问题（P0-1 含 3 个子问题）。经逐项判别：**修复 7 项，暂缓 2 项**。

| 编号 | 问题 | 判定 | 原因 |
|------|------|------|------|
| P0-1a | Popup 保存时 SourcePlatform 未定义崩溃 | ✅ 修复 | ReferenceError |
| P0-2 | Android/macOS 构建入口 | ⏸️ 暂缓 | 同前，需 IDE 工具 |
| P1-1 | getSessionsByDate 仍按 UTC 切片 | ✅ 修复 | 跨时区数据归属错误 |
| P1-2 | getStatus 缺 toolId 等字段 | ✅ 修复 | 补全 entry 字段缺失 |
| P1-3 | 补全表单缺 PRD 成本拆分字段 | ✅ 修复 | 账本数据不完整 |
| P1-4 | 保存失败无反馈 | ✅ 修复 | 静默数据丢失 |
| P1-5 | Android 编译风险 | ⏸️ 暂缓 | 需构建验证，非代码 bug |
| P2-1 | UTC 日期残留 | ✅ 修复 | 多处 cross-midnight/导出文件名 |
| P2-2 | 顶层 icons 缺 32px | ✅ 修复 | manifest 尺寸一致 |

---

## 修复详情

### P0-1 — Popup 补全保存时 `SourcePlatform` 未定义崩溃

**问题**：popup.html 只加载 `popup.js`，不加载 `shared/enums.js`。代码中 `SourcePlatform?.BROWSER` 对未声明变量仍抛 `ReferenceError`。

**文件**：`browser-extension/src/popup/popup.js:320`

**修复**：`SourcePlatform?.BROWSER || 'browser'` → 直接使用字面量 `'browser'`。Popup 只需一个固定平台值，无需导入完整 enum 模块。

---

### P1-1 — getSessionsByDate 忽略 session.localDate

**问题**：API 调用方已改用本地日期，但 storage 层仍从 `startedAt`（ISO UTC）截取日期比较。凌晨 0-8 点的 session.localDate 是当天，`startedAt.slice(0,10)` 可能是前一天。

**文件**：`browser-extension/src/shared/storage.js:94-101`

**修复**：
```js
// before: always parse startedAt
const datePart = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);

// after: prefer explicit localDate, fallback to local-time parse
if (s.localDate) return s.localDate === dateStr;
const datePart = new Date(d).toLocaleDateString('en-CA');
```

---

### P1-2 — getStatus 不返回 toolId 等补全必需字段

**问题**：Popup 构建 LedgerEntry 需要 `toolId`、`sourcePlatform`、`localDate`、`timezone` 等，但 `getStatus.currentSession` 只返回 `id/toolName/domain/startTime/duration/status`。

**文件**：`browser-extension/src/background/service-worker.js:260-269`

**修复**：`getStatus` 响应中 `currentSession` 增加字段：
```js
toolId, sourcePlatform, sourceKind, rawDomain, localDate, timezone
```

---

### P1-3 — 补全表单缺 PRD 成本拆分字段

**问题**：Popup 只有"估计节省时间 + 质量 + 感受"，Prompt/审核/修改/查错/返工等分钟字段被硬编码默认值。PRD 核心公式无法由用户真实输入驱动。

**文件**：`popup.html:57-101`、`popup.js:300-354`

**修复**：

1. **popup.html** — 表单扩展为完整 PRD 字段：
   - 新增：用途选择（代码审查/调试排错/内容写作/研究分析/学习辅助/翻译/其他）
   - 新增：Prompt时间 / 审核时间 / 修改时间 / 查错时间 / 返工时间（数字输入）
   - 新增：备注（文本输入）
   - 新增：错误提示区域 `#compError`

2. **popup.js** `onSaveCompletion()` — 重写为使用真实用户输入：
   ```js
   const promptMinutes = parseInt(document.getElementById('compPromptMinutes').value) || 0;
   const reviewMinutes = parseInt(document.getElementById('compReviewMinutes').value) || 0;
   // ... editMinutes, debugMinutes, reworkMinutes
   const totalExtraCostMinutes = promptMinutes + reviewMinutes + editMinutes + debugMinutes + reworkMinutes;
   const netGainMinutes = estimatedSavedMinutes - totalExtraCostMinutes;
   ```
   - `hasRework` 计算改为 `reworkMinutes > 0 || quality === 'useless' || (netGainMinutes < 0 && extraCost >= saved)`
   - Default promptMinutes 改为 `min(durationMinutes || 5, 5)`

---

### P1-4 — 保存失败无反馈

**问题**：
1. `storage.saveEntry()` catch 后只打印日志，不抛出 → Service Worker 认为写入成功
2. Popup 不检查 `sendMessage('saveEntry')` 响应 → 失败时仍关闭表单

**文件**：`storage.js:158-160`、`popup.js:348-353`

**修复**：

1. **storage.js** — `saveEntry()` 异常后 `throw err`（不再吞掉）
2. **popup.js** — 保存后检查响应：
```js
const saveResp = await sendMessage('saveEntry', { entry });
if (!saveResp.success) {
  document.getElementById('compError').textContent = '保存失败: ' + (saveResp.error || '未知错误');
  document.getElementById('compError').style.display = 'block';
  return; // 保留表单
}
```

同时 `quickComplete` 失败也显示错误，不继续保存。

---

### P2-1 — UTC 日期残留

**位置**：`csv-exporter.js:128,134`、`sessionizer.js:230-231`、`storage.js:221`、`options.js:323,340,356`、`weekly-review.js:17`

**修复**：以上 8 处 `new Date().toISOString().slice(0, 10)` 或等价 UTC 切片全部替换为 `new Date().toLocaleDateString('en-CA')`。

- `csv-exporter.js`：下载文件名日期
- `sessionizer.js`：`crossesMidnight()` 判断
- `storage.js`：`getTodaySummary()` 今日查询
- `options.js`：导出文件名日期（3 处）
- `weekly-review.js`：周末日期字符串

---

### P2-2 — 顶层 icons 缺 32px

**文件**：`manifest.json:48-52`

**修复**：顶层 `icons` 增加 `"32": "icons/icon32.png"`，与 `action.default_icon` 尺寸集合一致。

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

| 平台 | P0 | P1 | P2 | 修改文件 |
|------|----|----|----|---------|
| Browser Extension | 1 | 4 | 2 | 9 |
| Android | 0 | 0 | 0 | 0 |
| **合计** | **1** | **4** | **2** | **9** |
