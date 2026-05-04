# Murmur 七轮修复后发布准备复审报告

> 复审日期：2026-05-04  
> 复审范围：当前仓库 Browser Extension、Android、macOS、发布准备状态  
> 复审目标：判断当前项目是否已具备 Chrome 插件和 macOS 发布条件，并列出发布前必须修复项。  
> 复审方式：静态代码审查 + 浏览器扩展 build 验证 + 关键 JS 语法检查。未做业务代码变更。

## 总体结论

当前项目里，**Chrome/浏览器插件最接近可发布**：manifest、图标、dist 构建、Popup 补全表单、AI 网站检测、CSV 导出、本地存储等基础能力都已经具备。它适合进入“发布前硬化 + 非公开测试”阶段。

**macOS 仍不具备发布条件**：仓库中只有 Swift 源文件和资源文件，没有 Xcode project、workspace、Swift Package 或可执行构建脚本，因此无法签名、归档、公证、打包，也无法确认 App target、资源拷贝、Accessibility 权限、Native Messaging host 等发布配置。

## 发布建议

### Chrome 插件

建议先发布为 **Unlisted / 非公开链接测试版**，不要直接 Public。原因是浏览器端还有几个数据一致性风险，适合先让小范围用户测试完整路径。

发布前最低要求：

1. 修复 `completeAndSaveEntry` 的真实原子性问题。
2. 用真实 Chrome 加载 `browser-extension/dist`，完整走一遍检测、补全、保存、统计、导出、清空。
3. 写好隐私政策，确保 Chrome Web Store 隐私声明与代码行为一致。
4. 准备截图、商店描述、权限用途说明。
5. 打 zip 包上传 Chrome Web Store Developer Dashboard。

### macOS

暂不建议发布。下一步不是打包，而是先创建工程：

1. 创建 Xcode macOS App project。
2. 把 `macos/Murmur` 下所有 Swift 文件加入 target。
3. 把 `macos/Murmur/Resources/tool-catalog.json` 加入 Copy Bundle Resources。
4. 配置 bundle id、Signing、Hardened Runtime、Accessibility 权限说明。
5. 跑通 Archive、Developer ID 签名、Notarization、Staple。

## P0 / Chrome 发布前必须修复

### P0-1 Browser：`completeAndSaveEntry` 仍不是真正原子，失败时可能留下半成功数据

**位置**

- `browser-extension/src/background/service-worker.js:500-524`
- `browser-extension/src/background/sessionizer.js:179-193`
- `browser-extension/src/shared/storage.js:54-61`

**问题**

当前 `completeAndSaveEntry` 被描述为原子操作，但内部仍然先调用：

```js
const session = await quickEndSession(domain);
```

而 `quickEndSession()` 会立即保存 pending session、移除 active session：

```js
await saveSession({ ...session });
activeSessions.delete(domain);
domainToolMap.delete(domain);
saveActiveSession(null);
```

如果随后 `saveEntry(entry)` 失败，用户会看到保存失败，但 session 已经结束，不再可重试为 active session。

**发布影响**

这是 Chrome 插件发布前最高风险的数据一致性问题。用户一旦遇到 storage 失败、扩展重启、并发消息等边界情况，可能出现“会话结束了，但账本没保存”的状态。

**建议**

重构为真正事务式提交：

```js
const session = getSessionForDomain(domain);
if (!session) return { success: false, error: 'No active session' };

const completedSession = buildCompletedSession(session);
const entry = buildEntry(payload.entry, completedSession.id);

await saveEntry(entry);
await saveSession({ ...completedSession, status: SessionStatus.COMPLETED });
removeActiveSession(domain);
return { success: true, data: { session: completedSession, entry } };
```

关键点是：**不要在 entry 保存成功前移除 active session**。

### P0-2 Browser：`saveSession()` 吞掉异常，调用方无法知道 session 是否写入成功

**位置**

- `browser-extension/src/shared/storage.js:54-61`

**问题**

`saveSession()` catch 后只打印日志，不抛错：

```js
} catch (err) {
  console.error('[Murmur Storage] Failed to save session:', err);
}
```

这会让 `quickEndSession()` 和 `completeAndSaveEntry()` 误以为 session 已保存。

**发布影响**

可能出现 Entry 已保存但 session 不存在，或 session 未被标记 completed。

**建议**

和 `saveEntry()` 一样，失败时 `throw err`：

```js
} catch (err) {
  console.error('[Murmur Storage] Failed to save session:', err);
  throw err;
}
```

### P0-3 Browser：`completeAndSaveEntry` 未检查 `updateSession()` 返回值

**位置**

- `browser-extension/src/background/service-worker.js:519-522`
- `browser-extension/src/shared/storage.js:70-83`

**问题**

当前直接：

```js
await updateSession(session.id, { status: SessionStatus.COMPLETED, updatedAt: new Date().toISOString() });
return { success: true, data: { session, entry } };
```

如果 update 返回 `null`，用户仍收到 success。

**发布影响**

Entry 已保存，但 session 仍 pending 或不存在，待补全列表和统计会不一致。

**建议**

检查返回值：

```js
const updated = await updateSession(...);
if (!updated) {
  throw new Error('Linked session could not be marked completed');
}
```

## P1 / Chrome 发布前强烈建议修复

### P1-1 Browser：公开的 `saveEntry` message handler 仍可能返回假成功

**位置**

- `browser-extension/src/background/service-worker.js:528-544`

**问题**

`saveEntry` handler 检查了 `updateSession()`，但 linked session 找不到时只 warning，仍返回 success。

**建议**

如果保留这个 message action，应返回 failure 或至少 warning 字段。更好的方式是只暴露 `completeAndSaveEntry`，避免外部入口绕过完整流程。

### P1-2 Browser：缺少真实交互测试

**位置**

- 当前仓库未发现浏览器自动化测试。

**风险**

`npm run build` 只能验证文件存在和 manifest 基本结构，不会验证：

- Popup 能否打开；
- 点击完成会话是否打开表单；
- 保存 entry 后统计是否更新；
- 离开 AI 网站 session 是否结束；
- CSV 导出内容是否正确；
- storage 异常是否反馈。

**建议**

发布前至少手动测一遍。理想情况用 Playwright/Chrome Extension 自动化覆盖核心路径。

## P2 / 发布体验优化

### P2-1 Browser：隐私说明需要和权限用途完全对齐

**位置**

- `browser-extension/manifest.json:7-33`
- `browser-extension/src/options/options.html:84-121`

**说明**

当前权限包括：

```json
"tabs",
"webNavigation",
"storage",
"alarms"
```

以及多个 AI 站点 host permissions。商店审核时需要解释这些权限为什么必要。

**建议文案**

- `tabs`：读取当前标签页域名，用于判断是否正在访问 AI 工具。
- `webNavigation`：检测页面导航，判断 AI 使用会话开始/结束。
- `storage`：把记录保存在本机浏览器本地存储。
- `alarms`：周期性刷新/保存检测状态。
- host permissions：仅用于匹配支持的 AI 网站域名，不读取 prompt 内容，不采集页面正文。

### P2-2 Browser：建议先 Unlisted 发布

**原因**

当前产品还处在轻量账本闭环阶段，适合先用 Unlisted 链接给小范围用户测试：

- 数据一致性；
- 权限授权体验；
- 不同 AI 网站识别准确率；
- Popup 补全表单可用性；
- 导出数据字段是否足够。

## macOS 发布阻断项

### macOS-1：没有 Xcode/SwiftPM 工程入口

**位置**

- `macos/` 下未发现 `.xcodeproj`
- 未发现 `.xcworkspace`
- 未发现 `.pbxproj`
- 未发现 `Package.swift`

**影响**

当前无法执行：

- build；
- archive；
- signing；
- notarization；
- DMG/ZIP 打包；
- Gatekeeper 验证。

### macOS-2：发布配置尚未建立

发布 macOS App 至少还需要：

- Bundle Identifier；
- Developer ID Application 证书；
- Hardened Runtime；
- entitlements；
- Accessibility 权限说明；
- App icon；
- Info.plist；
- Resources copy phase；
- Native Messaging host 安装策略；
- Notarization 流程。

## Chrome 插件发布流程建议

### 1. 发布前修复

先完成：

```text
P0-1 completeAndSaveEntry 真原子保存
P0-2 saveSession 失败抛错
P0-3 updateSession 返回值检查
```

### 2. 本地构建

```bash
npm --prefix browser-extension run build
```

### 3. 本地加载测试

打开：

```text
chrome://extensions
```

开启 Developer mode，选择：

```text
Load unpacked → browser-extension/dist
```

手动测试：

```text
1. 打开 chatgpt.com / chat.deepseek.com / doubao.com
2. 确认 Popup 显示 AI 网站使用中
3. 等待 30 秒以上
4. 点击完成会话
5. 填写用途、节省时间、Prompt/审核/修改/查错/返工时间、质量、感受
6. 保存
7. 确认今日已记录 +1
8. 导出 Entries CSV，确认字段正确
9. 离开 AI 网站，确认 session 不继续计时
10. 清空数据，确认本地数据删除
```

### 4. 打包 zip

```bash
cd browser-extension/dist
zip -r ../murmur-browser-extension-1.0.0.zip . -x "*.DS_Store"
```

确认 zip 顶层直接包含：

```text
manifest.json
src/
icons/
```

不要 zip 成：

```text
dist/manifest.json
```

### 5. 准备商店资料

需要准备：

```text
名称：Murmur
一句话说明：记录 AI 使用后的省时、返工和精力成本
详细描述
128x128 图标
至少 1-3 张截图
隐私政策 URL
支持邮箱
分类：Productivity
语言：中文/英文按目标市场选择
发布方式：Unlisted
```

### 6. Chrome Web Store Developer Dashboard

操作路径：

```text
Chrome Web Store Developer Dashboard
New item
上传 murmur-browser-extension-1.0.0.zip
填写 Store listing
填写 Privacy practices
填写 Permissions justification
选择 Visibility: Unlisted
Submit for review
```

### 7. 审核后

审核通过后先发给测试用户链接，收集：

```text
安装是否顺利
AI 网站是否识别准确
今日统计是否可信
补全表单是否太长
CSV 是否满足需求
是否有权限/隐私疑虑
```

## 验证结果

### 已执行

```bash
npm --prefix browser-extension run build
```

结果：通过。

```bash
node --check browser-extension/src/popup/popup.js
node --check browser-extension/src/background/service-worker.js
node --check browser-extension/src/shared/storage.js
node --check browser-extension/src/calculator/weekly-review.js
```

结果：通过。

旧枚举/旧状态字符串检索：未检出残留。

### 未执行

- 未运行真实 Chrome Popup 交互测试。
- 未执行 Android/macOS 构建。
- 未执行 Chrome Web Store 上传预检。

## 最终判断

**Chrome 插件：** 已接近发布，但建议先修 3 个 P0 数据一致性问题，再发布 Unlisted beta。  
**macOS：** 还不能发布，必须先补 Xcode/SwiftPM 工程和签名公证流程。
