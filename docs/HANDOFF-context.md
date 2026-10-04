# 液态玻璃插件 — 上下文交接（给下一个 AI）

> **动画模块的代码已被删除。** 本文件说明：现在剩下什么、为什么删、接手时要知道什么。
> 所有结论来自实测 / 运行日志 / 代码核对，不是推断 —— 除非标注"假设"。

---

## 0. 一句话现状

**动画模块（入场手势 + 欢迎页三拍 + 相关闸门 + 安静门控）已从源码中删除**，用户要求重做。
现在生效的只有**玻璃材质** + **打标/扫描系统** + **两道非动画闸门**。
**契约校验 28/28 通过**：`node DSH-App\tools\verify-glass-plugin.js`

删除前的完整副本：
- `glass-plugin\_animation-backup\`（6 个文件，含 `MANIFEST.txt`）
- `glass-plugin\_archive-2026-10-01-07-16\`（整树 16 文件 + sha256）

---

## 1. 项目与环境

| 项 | 值 |
|---|---|
| 插件目录 | `E:\deepseek-V4-flash\glass-plugin` |
| 包名 | `dsh-plugin-liquid-glass` v0.1.4 |
| 宿主 | DSH 桌面版 Electron 44 / Chromium 152，页面 `dsh-app://app/` |
| 宿主 webServer | `http://127.0.0.1:19387` |
| **新契约校验** | `DSH-App\tools\verify-glass-plugin.js`（**28 项，全绿**）← 用这个 |
| ~~旧契约校验~~ | ~~`verify-entrance-contract.js`~~（守的是已删除的动画设计，**已废弃，会一直失败**） |
| 存档 | `glass-plugin\_animation-backup\`、`_archive-2026-10-01-07-16\` |
| 交接镜像 | `C:\Users\神猫君\Desktop\DSH-上下文交接\玻璃插件源码\` |

### 插件机制
- `package.json`：`exports["./client"]` + `dsh.client = { inject:["@deepseek-ai/dsh-client-runtime"], platform:"web", immediately:true }`
- 客户端 bundle：`window.__ModuleLoader__.load({ id:'dsh-plugin-liquid-glass', factory:(require)=>{...} })`
- 注入：`ctx.webServer.collectIndexInjections()` → **单条 inline `<script>` 行**
- **绝不要注入进 `#root`**（会卡在 "Loading plugins…"）
- 静态路由 `/dsh-glass/<file>`（`no-store`）；诊断 `POST /dsh-glass/log` → 追加写 `artifacts/startup-timeline.log`

### ⛔ 硬约束
1. **绝不在承载 `backdrop-filter` 的元素上动画 opacity/transform** —— Chromium 提升独立合成层，backdrop 采样中断，**材质变平**。动画必须加在**祖先 wrapper**上。
2. **一个可视属性只能有一个归属**：闸门管 `visibility`，动画管 `opacity`/`transform`。两个归属必然抢帧。
3. **绝不缩放文字。**
4. **重启必须由用户手动做。** AI **不许**杀/重启桌面应用（agent 运行器寄生其中）。已被批评 3 次。
5. 打包版**没有 Reload Page 菜单**，**Ctrl+R 无效**。
6. **只改被明确要求的范围。** 曾擅自改输入框/顶栏/工作区，都被要求回退。
7. **读写含中文的文件必须走 Node。** PowerShell 的 `Get-Content` 按 GBK 解码 UTF-8 会毁掉文件（我因此弄坏过校验器）。
8. **大改前先存档**：`node DSH-App\tools\archive-glass-plugin.js`

---

## 2. 现在剩下什么

### 生效的功能
| 功能 | 位置 |
|---|---|
| 玻璃材质（气泡 / 输入框 / 侧栏 / 右侧栏 / 顶栏 / 卡片） | `10-glass-composer.css`、`20/30-glass-bubble-*.css`、`50-glass-surfaces.css` |
| 可读性下限（有壁纸时抬高不透明度） | `50-glass-surfaces.css` |
| 无壁纸时的背面动态条纹 + 指针光晕 | `client.js`（`ensureBackdrop` / `ensureGlow` / `bindPointer`） |
| **打标 / 扫描系统** | `client.js`（`markComposer` / `markSurfaces` / `adoptComposerNode`） |
| 扫描性能优化 | `collectRoots` / 无类名叶子预过滤 / 流式期跳过全量 |
| **外壳闸门**（`dsh-glass-ui`） | 非动画，见下 |
| **转写区闸门**（`dsh-glass-new-session`） | 非动画，见下 |

### 两道**刻意保留**的闸门（都不是动画，别当成动画删掉）
| 闸门 | 作用 | 为什么保留 |
|---|---|---|
| `dsh-glass-ui` | `body > *` 隐藏到**材质样式表应用完成** | 样式表在应用首帧**之后**才注入，否则整个窗口以"无玻璃"状态显示 —— 用户明确反馈过这个"乱首帧"。**逐元素闸门盖不住"所有元素都错"的时段**。 |
| `dsh-glass-new-session` | 隐藏 `scrollBody` / `conversation` 卡片 | 应用会**先恢复上一个会话**再切新会话，否则用户会看到旧会话闪一下再跳走 |

**材质就绪判定**：每张 `<link>` 的 `load`/`onerror` 事件（不是计时器）→ `window.__dshGlassStylesReady`
**兜底**：`armShellFallback()` 5 秒后无条件放行外壳 —— 脚本失效也不会留空窗口
**无障碍**：`prefers-reduced-transparency: reduce` 下外壳闸门豁免

---

## 3. 已删除的东西（**不要照抄回来，先读第 4 节**）

| 删除项 | 原位置 |
|---|---|
| 输入框入场手势（关键帧 + seat 类） | `client.js`、`50-glass-surfaces.css` |
| `composerSeat` / `playComposerEntrance` / `playComposerEntranceSoon` | `client.js` |
| `noteSessionForComposerEnter` + 会话到达检测状态 | `client.js` |
| `deferEntranceUntilQuiet` / `quietForMs` / `playDeferredEntrances` / `QUIET_*` | `client.js` |
| 欢迎页三拍（关键帧 + 延迟变量 + 闸门） | `50-glass-surfaces.css`、`bootstrap.js` |
| 输入框揭幕闸门（`dsh-glass-ready` 家族） | `bootstrap.js`、`50-glass-surfaces.css` |
| 侧栏/顶栏闸门（`dsh-glass-welcome` 家族） | `bootstrap.js`、`50-glass-surfaces.css` |
| 12 秒熔断（`armRevealFallback`）+ `dsh-glass-force-show` | `bootstrap.js` |
| 动画总开关（`ANIMATION_MODULE` / `animationOn` / `__dshGlassAnimate`） | `client.js` |
| `probeComposerGeometry` + composer 几何轮询（日志刷屏元凶） | `client.js` |
| 全部 `--dsh-glass-enter-*` / `--dsh-welcome-*` 变量 | `50-glass-surfaces.css` |

**保留但已关闭**：`__dshGlassAnimateGrowth`（**文字生长**动画，另一个功能，默认关闭，本轮未动它）

---

## 4. 重做动画前必须知道的（这轮踩过的坑）

### 4.1 同一属性两个归属 → 抢帧（最难查的问题）
症状：输入框**有材质、停在起始位置**显示了一帧或数秒，然后才播动画。
根因：**闸门管 `opacity`（带 220ms 过渡）+ 入场动画也管 `opacity`** → 过渡先落地，画出那一帧。
**靠"抑制过渡"（`transition:none !important`）修不好** —— 抢先的正是闸门自己的过渡。
→ **正确做法：闸门只碰 `visibility`（不可插值、无过渡），动画独占 `opacity`/`transform`。**

### 4.2 应用会**重建节点** → "一次性"必须放在 body 上
实测：启动 8 秒内**顶栏被替换 3 次**；点工作区会替换工作区块节点。
→ **节点级标记会随节点消失，入场会重播**（症状：点工作区时面板"往回收一下"）。
→ 任何"只播一次"必须用 **body 级**标记。

### 4.3 首帧"整个界面无玻璃" → 逐元素闸门无解
样式表在**应用首帧之后**注入，所以有段时间**每个元素都没有材质**。
→ 只能**整体扣住外壳**（`body:not(.dsh-glass-ui) > *`），不能逐个元素盖。

### 4.4 主线程被加载占住时，动画会"冻结"（不是掉帧）
实测：应用加载期间主线程最长被堵 **1142ms**，`>100ms` 的间隙 47 次。
→ 这段时间**连合成线程的动画也停**。动画撞上加载就会"播一半卡住"。
→ 可行做法：**等主线程安静再播**（当时的 `deferEntranceUntilQuiet`），或**干脆在加载完成后才开始**。

### 4.5 一次只改一处
这轮一次性加了 3 个动画（顶栏 / 工作区 / 侧栏按钮），出问题后**无法定位是哪一个**。
→ **每加一个 → 让用户重启验证 → 再加下一个。**

### 4.6 性能数据（供参考）
```
扫描优化前：遍历 body * = 4966 元素，单次 100~190ms，最差 407ms
扫描优化后：即时扫描 289 元素，单次 2.2~5.5ms
```

---

## 5. 文件状态

```
E:\deepseek-V4-flash\glass-plugin\
  package.json / cordis.patch.yml
  lib\index.js              服务端入口、路由、注入行
  lib\client.js             客户端模块：请求新会话（不改它就够用）
  artifacts\
    bootstrap.js      472 行  inline 关键 CSS（两道非动画闸门）+ 时间线 + 外壳兜底
    client.js        2069 行  打标/扫描/材质/诊断探针（**无动画**）
    10-glass-composer.css    输入框材质（blur 32px + saturate 240%，已去磨砂）
    20-glass-bubble-user.css / 30-glass-bubble-agent.css   气泡材质
    40-ready-gate.css        首帧无过渡闸门
    50-glass-surfaces.css 541 行  材质/侧栏/顶栏/工作区/外壳闸门（**无关键帧**）
    startup-timeline.log     诊断日志（每轮重启前清空）
  _animation-backup\         删除前的 6 个文件副本 + MANIFEST
  _archive-2026-10-01-07-16\ 删除前的整树快照 + MANIFEST
```

---

## 6. 验证与取证

```powershell
# 契约校验（动画已删净 + 材质/闸门完好）
node E:\deepseek-V4-flash\DSH-App\tools\verify-glass-plugin.js      # 28/28

# 存档（大改前必跑）
node E:\deepseek-V4-flash\DSH-App\tools\archive-glass-plugin.js
```

**读日志**：`artifacts/startup-timeline.log`（JSONL）。**先清空再让用户重启一次**。
现有阶段名：
```
bootstrap:start|gate-injected|load|assets-requested|styles-ready|styles-ready-fallback|shell-fallback-fired|composer-probe|welcome-page
client:start|composer-marked|composer-adopted|composer-revealed|transcript-revealed|session-switch-landed|awaiting-styles
client:scan-cost|frame-gaps|blur-surface|topbar-geometry|sidebar-material-at-rest|unmarked-controls
new-session:applied|started|failed|no-service|no-method|gave-up|disabled
```

**环境限制**：CDP 端口（9299/9500）正常实例里通常是关的，需用户执行
`DSH-App\tools\restart-desktop-debug-port.ps1 -Port 9299`。

### 已知的应用侧事实
- 容器类名：侧栏 **`[class*="sidebarCol"]`**、中央列 `[class*="centerCol"]`、顶栏 **`<header>`**
- 输入框祖先链：`RlGAzG_input → _grow → _scroll → RlGAzG_card → RlGAzG_root(RlGAzG_hero)`
- 欢迎页 hero：`Dc7zOa_composerHero` 含 `Hqq-bq_root`(标题) / `Dc7zOa_heroWorkspaceRow`(选择行) / `RlGAzG_root.RlGAzG_hero`(输入框)
- 顶栏在启动中被重建 3 次（8 秒内）
- 视口每 ~2.5s 有 ~7px 抖动（**非插件所致**）
- **GPU A/B 开关**：`document.documentElement.setAttribute('data-dsh-glass-perf','low')`

---

## 7. 用户偏好（务必遵守）

1. **不许杀/重启应用** —— 请用户手动重启。
2. **视觉结论必须来自运行数据**；截图只作辅助。禁止"看起来对了"。
3. **只改被明确要求的范围**；多做先问。
4. **改动留决策记录**（注释写"为什么这么做、为什么别改回去"）。
5. 语言：**中文**，直给结论 + 证据。
6. 工作区 `AGENTS.md`：余额 < ¥3 禁用视觉 API；单对话视觉 API 预算 ¥1.5。**本项目从未调用视觉 API。**
7. **大改前先存档。**
