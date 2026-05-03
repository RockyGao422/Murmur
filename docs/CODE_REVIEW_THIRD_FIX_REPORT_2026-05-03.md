# Murmur 第三次复审修复报告

> 基于 `docs/CODE_REVIEW_RECHECK_SECOND_REPORT_2026-05-03.md` 的修复实施记录  
> 修复日期：2026-05-03

## 判定与修复结果

第三次复审共提出 10 项问题。经逐项判别：**修复 8 项，暂缓 3 项**。

| 编号 | 问题 | 判定 | 说明 |
|------|------|------|------|
| P0-1 | saveEntry 旧字段去重覆盖数据 | ✅ 修复 | 静默数据丢失 |
| P0-2 | manifest 图标格式 | ✅ 修复 | 发布阻断 |
| P0-3 | Android/macOS 构建入口 | ⏸️ 暂缓 | 需 IDE 工具 |
| P1-1 | Popup 计时器 NaN | ✅ 修复 | UI 异常 |
| P1-2 | pauseSession 字段不兼容 | ✅ 修复 | 暂停功能失效 |
| P1-3 | connectNative 绕过 settings | ✅ 修复 | 安全门控缺失 |
| P1-4 | Android 账本 schema | ⏸️ 暂缓 | 深层迁移需单独规划 |
| P1-5 | Prompt Count 闭环 | ⏸️ 暂缓 | 功能设计缺口 |
| P2-1 | 旧 moodWeights 残留 | ✅ 修复 | 死代码清理 |
| P2-2 | CompletionScreen 显示枚举名 | ✅ 修复 | UI 文案 |

---

## 修复详情

### P0-1 — saveEntry 数据覆盖 bug

**问题**：`saveEntry()` 按 `e.sessionId === entry.sessionId` 去重。新模型 entry 使用 `detectedSessionId`（`sessionId` 为 `undefined`），第二条及后续无 `sessionId` 的 entry 全部匹配到第一条，执行覆盖写入。

**文件**：`browser-extension/src/shared/storage.js:143`

**修复**：
```js
// 旧代码（只匹配 sessionId）
const existingIdx = entries.findIndex((e) => e.sessionId === entry.sessionId);

// 新代码（双向兼容 detectedSessionId 和 sessionId）
const existingIdx = entries.findIndex((e) =>
  (entry.detectedSessionId && e.detectedSessionId === entry.detectedSessionId) ||
  (entry.detectedSessionId && e.sessionId === entry.detectedSessionId) ||
  (entry.sessionId && e.sessionId === entry.sessionId) ||
  (entry.sessionId && e.detectedSessionId === entry.sessionId)
);
```

### P0-2 — manifest 图标格式

**问题**：
1. manifest 使用 `"icons": "icons/icon.svg"` 字符串格式，Chrome 要求尺寸对象
2. SVG 图标不被 Chrome 官方支持
3. build.js 允许 string icons 和 SVG

**修复**：

1. **生成 PNG 图标**：Python 脚本生成 16x16/48x48/128x128 PNG（品牌色 #4F46E5）
   - `icons/icon16.png`（79 bytes）
   - `icons/icon48.png`（124 bytes）
   - `icons/icon128.png`（307 bytes）

2. **manifest.json**：icons 改为尺寸对象格式
```json
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

3. **scripts/build.js**：严格校验
   - 拒绝 string 格式 icons（必须为对象）
   - 拒绝 `.svg` 后缀图标
   - 要求 `16`/`48`/`128` 尺寸存在且文件可访问
   - `action.default_icon` 同样校验

### P1-1 — Popup 计时器 NaN

**问题**：service worker 返回 `startedAt`（ISO 字符串）作为 `startTime`，但 popup 的 `startTimer()` 用 `Date.now() - startTime` 计算（期望 epoch ms），得到 `NaN`。

**文件**：`browser-extension/src/popup/popup.js:229`

**修复**：
```js
// 调用前归一化
const startMs = typeof currentSessionData.startTime === 'string'
  ? new Date(currentSessionData.startTime).getTime()
  : currentSessionData.startTime;
startTimer(startMs);
```

### P1-2 — pauseSession 字段不兼容

**问题**：`pauseDetection()` 遍历 active sessions 后调用 `pauseSession(session.domain)`，但新 session 字段为 `rawDomain`（`domain` 不存在）。

**文件**：`browser-extension/src/background/detector.js:218`

**修复**：
```js
// 旧代码
pauseSession(session.domain);

// 新代码
const key = session.rawDomain || session.domain;
if (key) pauseSession(key);
```

### P1-3 — connectNative 绕过 settings

**问题**：启动时 Native Messaging 已有 settings gating，但 message handler 中的 `connectNative` case 直接调用 `nativeMessaging.connect()`，未检查 `settings.nativeMessagingEnabled`。

**文件**：`browser-extension/src/background/service-worker.js:470-473`

**修复**：
```js
case 'connectNative': {
  const settings = await getSettings();
  if (!settings.nativeMessagingEnabled) {
    return { success: false, error: 'Native messaging is not enabled in settings' };
  }
  // ... existing connect logic
}
```

### P2-1 — 旧 moodWeights 残留

**问题**：`UserMood` 枚举已通过构造函数参数 `moodWeight: Int` 表达疲劳权重，但 companion object 仍保留旧的 `moodWeights` 浮点效率映射（`EASY to 1.2f` 等），无调用方，属于死代码且容易误导开发。

**文件**：`android/.../domain/model/Models.kt:83-90`

**修复**：删除 `moodWeights` map，替换为注释说明。

### P2-2 — CompletionScreen 显示枚举名

**问题**：平台展示使用 `session.sourcePlatform.name`，输出 `ANDROID` 而非产品文案。

**文件**：`android/.../ui/completion/CompletionScreen.kt:98`

**修复**：`session.sourcePlatform.name` → `session.sourcePlatform.value`（输出 `android` 等 shared schema 标准值）

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

构建通过，PNG 图标校验和格式校验均生效。

---

## 暂缓项说明

| 编号 | 问题 | 暂缓原因 |
|------|------|----------|
| P0-3 | Android/macOS 构建入口 | `gradlew` 需 Android Studio 生成（含二进制 `gradle-wrapper.jar`）；`.xcodeproj` 为 Xcode 二进制 plist 格式。源文件已齐备，可手动创建工程导入 |
| P1-4 | Android 账本 schema | 涉及 Entity/DAO/Domain/UI Completion/CSV Export 多层联动，需专门做 migration pass，不宜碎片化修改 |
| P1-5 | Prompt Count 闭环 | 功能设计层面问题（需要 optional `scripting` permission + 各 AI 站点 DOM 适配 + 动态注入机制），非当前代码 bug |

---

## 附录：三轮审查「不修改/暂缓」问题详细理由

以下汇总三轮审查报告（`CODE_REVIEW_REPORT`、`CODE_REVIEW_RECHECK_REPORT`、`CODE_REVIEW_RECHECK_SECOND_REPORT`）中所有判别为暂缓或不修改的问题及原因。

### 类别一：需 IDE / 二进制工具生成（非文本代码可修复）

#### macOS 无 Xcode 工程（三轮均提及）

`.xcodeproj` 是 macOS bundle 目录，核心文件 `project.pbxproj` 是 Apple 专有 plist 格式，内含数十个 UUID 引用、target membership、build phase 配置、scheme 定义等数百行结构化数据。它不是人类手写的文本文件，必须通过 Xcode 的 Project Editor 或 `xcodebuild` 命令行生成。手工拼装几乎必然导致编译失败。

当前仓库中 42 个 Swift 源文件 + `tool-catalog.json` bundle resource 已齐备。创建方式：Xcode → File → New → Project → macOS App，将 `Murmur/` 目录下所有 `.swift` 文件拖入 target，将 `Resources/tool-catalog.json` 加入 Copy Bundle Resources。

#### Android 无 Gradle wrapper（三轮均提及）

`gradlew` 脚本依赖 `gradle/wrapper/gradle-wrapper.jar`，这是一个数十 KB 的 Java 二进制 JAR 文件，无法用文本编辑器创建。正确生成方式：

```bash
# 方式 1：有 Gradle 环境
cd android && gradle wrapper --gradle-version 8.2

# 方式 2：Android Studio 打开 android/ 目录自动生成
```

生成后仓库会增加 4 个文件：`gradlew`、`gradlew.bat`、`gradle/wrapper/gradle-wrapper.jar`、`gradle/wrapper/gradle-wrapper.properties`。这 4 个文件需要一并提交。

---

### 类别二：需专属 migration pass（碎片修改会引入新问题）

#### Android LedgerEntry 字段与 shared schema 不一致（第二轮 4.1、第三轮 P1-4）

Android Entity 当前使用：
```
session_id / time_saved_seconds / extra_cost_seconds / net_gain_seconds / input_count / output_count
```

shared schema 要求：
```
detected_session_id / estimated_saved_minutes / prompt_minutes / review_minutes /
edit_minutes / debug_minutes / rework_minutes / total_extra_cost_minutes / net_gain_minutes
```

这不是替换几个字段名的问题。完整迁移需要同步修改以下所有层级：

| 层级 | 影响 |
|------|------|
| Room Entity | 字段重命名 → 需要 Room migration（或 destructive rebuild） |
| DAO | SQL 查询列名全部更新 |
| Domain Model | `LedgerEntry` data class 字段变更 |
| Repository | `toDomain()` / `toEntity()` 映射函数重写 |
| EntryCalculator | 公式从 `activeSeconds * quality * mood` 自动估算，改为用户手动录入分钟分项的纯求和 |
| CompletionViewModel | 默认值逻辑从输出次数改为分钟分项 |
| CompletionScreen | 表单 UI：移除 `inputCount/outputCount`，增加 `promptMinutes/reviewMinutes/editMinutes/debugMinutes/reworkMinutes` |
| CSVExporter | 导出列重写 |
| FatigueCalculator | 疲劳指数数据源调整 |

如果碎片化只改 Entity 不改 UI，编译直接失败；只改 UI 不改 DB，运行时 crash。必须整体规划一次覆盖全链路的 migration，不宜在单轮修复中穿插进行。

---

### 类别三：功能设计缺口（非当前代码 bug）

#### Prompt Count 无法启用（第一轮 4.4、第三轮 P1-5）

当前状态是**正确且符合设计的**：
- Manifest 已移除 `content_scripts`（P0 不应默认注入 content script）
- Settings 已正确默认 `promptCountingEnabled: false`
- `promptCount` 字段在 session schema 中保留，预留未来使用

缺失的是 P1 功能的**完整设计与实现**，不属于 bug 修复范畴：
1. 需要申请 `scripting` optional permission（与 `content_scripts` 的静态声明不同，需用户单独授权）
2. 需要为 ChatGPT / Claude / DeepSeek / 豆包 / Kimi 等十余个 AI 站点分别编写 DOM 选择器适配（各站 UI 结构不同）
3. 需要设计 options 页的启用开关 → 动态 `chrome.scripting.executeScript()` 注入逻辑
4. 各 AI 站点 UI 改版会导致选择器失效，需要持续维护策略和 fallback
5. 需要补全 `reportPrompt` 消息从 content script → background 的闭环

这些属于 P1 新功能开发，应在独立的功能迭代中完成。

---

### 类别四：原型阶段可接受的 trade-off

#### macOS JSON 存储 vs SQLite/GRDB（第一轮 4.1、第二轮 5.2）

技术方案推荐 SQLite + GRDB，当前使用 JSON 文件存储。

**原型阶段保留的理由**：
- 原型阶段数据量小（单用户、本地），JSON 文件全量读写的性能瓶颈尚未触发
- GRDB 需要 Swift Package Manager 依赖管理，而项目尚未建立 Xcode 工程，无法配置 SPM
- JSON 文件可直接用文本编辑器查看和调试，有利于原型迭代和问题排查
- 替换路径清晰：只需替换 `StorageManager` 的内部实现（`loadSessions` → GRDB query，`saveSessions` → GRDB insert），ViewModel / View 层调用接口无需变动

#### Browser Extension JavaScript vs TypeScript（第一轮 4.3）

技术方案写 TypeScript，当前为 JS + JSDoc。

**原型阶段保留的理由**：
- MV3 service worker 不支持 ES module import（`import` 语句），只能通过 `importScripts()` 同步加载。使用 TS 需要 bundler（webpack/esbuild）先编译再加载
- `.js` 文件可直接被浏览器加载运行，零编译步骤，开发反馈即时
- JSDoc 已提供完整的类型标注（`@typedef`、`@param`、`@returns`），IDE 可据此做类型提示
- 后续迁移 TS 路径明确：引入 esbuild → `src/*.js` → `src/*.ts` → build 输出到 `dist/`

#### chrome.storage.local 数组存储 vs IndexedDB（第一轮 4.4）

当前以数组形式整体读写 `chrome.storage.local`（每次保存读全量 → push → 写全量）。

**原型阶段保留的理由**：
- `chrome.storage.local` 对单用户日常使用量级（数百条 session）毫无压力
- IndexedDB 在 service worker 中的事务 API 比 `storage.local` 复杂得多
- 迁移路径明确：数据量增长后替换 `storage.js` 内部实现，上层调用方无需改动

#### camelCase 内部存储 vs snake_case 导出（第二轮 4.8）

内部模型使用 camelCase（JavaScript/Java/Swift 语言惯例），shared schema 为 snake_case。

**原型阶段保留的理由**：
- 运行时代码应使用语言惯例（`startedAt`、`sourcePlatform`）
- 导出（CSV / JSON export）可在输出时做一层 key 转换
- 三端各自使用宿主语言惯例，约束统一的导出格式即可做到跨端兼容
- 强行要求运行态全链路 snake_case 会降低开发效率和可读性

