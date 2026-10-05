# 开源后期维护与更新 — 上下文交接

> **给下一个工作区的 AI。** 本文件只讲两件事：**怎么维护/发版**，以及**哪些问题已解决、哪些没解决**。
> 每一句结论都来自本机实测 / 远端对象 / 逐字节比对，不是推断；标注「未验证」的就是真没验证。
>
> 写于 2026-10-05。上一个工作区的完整经过见 `HANDOFF-context.md`（那份讲动画与材质机制）。

---

## 0. 一句话现状

**插件已三线发布（npm 正式版 / npmmirror 镜像 / GitHub Release），线上最新 `0.1.6`，
而开发目录已经领先 0.1.6**：多了「设置界面液态玻璃」与一个**未解决**的工作区改动（见 §4）。

- 回归：`node dsh-ui-lab/tools/check-all.js` → **29/30**（唯一失败是发布闸门，因为 0.1.6 已发布，属预期）
- 契约：`node DSH-App/tools/verify-glass-plugin.js` → 全绿
- 最近还原点：`20261005-133334-FULL-PLUGIN-v2-settings-glass`（690 文件 / 17.8 MB，自检 19/19）

---

## 1. 项目与环境

| 项 | 值 |
|---|---|
| 插件目录 | `E:\deepseek-V4-flash\glass-plugin`（**同时是本机 DSH 实际加载的插件**） |
| 包名 / 线上版本 | `dsh-plugin-liquid-glass` / npm `latest = 0.1.6` |
| 验收基础设施 | `E:\deepseek-V4-flash\dsh-ui-lab`（工具、还原点、回归套件） |
| GitHub | `https://github.com/smj-1680/dsh-plugin-liquid-glass`（`main`，5 个提交，最新 `1b0f4a3`） |
| 宿主 | DSH 桌面版 Electron，页面 `dsh-app://app/`，webServer `http://127.0.0.1:19387` |
| DSH 自带 CLI | `E:\Deepseek\resources\runtime\cli\bin\dsh.cmd`（不在 PATH；`--version` → `0.2.0-rc.2`） |
| 本机 profile | `C:\Users\神猫君\.dsh\profiles\desktop`，插件在本机是 **junction 指向开发目录** |

### 1.1 ⚠ 两个 `client.js` 用途完全不同（最容易搞错的一点）

| 文件 | 大小 | 干什么 | 改动生效方式 | 进 npm 包 |
|---|---|---|---|---|
| `lib/client.js` | ~380 KB | **客户端模块**：只做"开屏落在新会话"一件事，**不碰玻璃材质** | 模块入口 → **必须整页重载/重启** | ✓ |
| `artifacts/client.js` | ~149 KB | **页面侧支持脚本**：玻璃折射、材质扫描与打标系统 | **可热更新**（多数情况不用重启） | ✓ |
| `lib/index.js` | — | 服务端入口：把 `artifacts/` 里的文件服务给页面（`ARTIFACT_DIR = PACKAGE_ROOT/artifacts`） | 服务端改动 → **必须重启** | ✓ |

**结论：改玻璃材质一律改 `artifacts/`**（`50-glass-surfaces.css` 等）。
`lib/client.js` 只有在改"开屏行为"时才动。

### 1.2 本机环境的坑（会影响你自己的操作）

- **profile 的 `node_modules` 是 pnpm 10 建的，而 DSH 自带 pnpm 11** → 任何
  `dsh plugin ... add/remove` 都会 `ERR_PNPM_UNEXPECTED_STORE` 失败。
  **只影响你本机**（结果见 §3.6）。修法要先备份 `profiles/desktop` 再 `pnpm install`。
- `github.com` / `raw.githubusercontent.com` 在本机常被 DNS/连接挡；`api.github.com` 与
  `registry.npmmirror.com` 正常。**所以用户安装一律走 npm**，不要引导去 GitHub 拉源码。

---

## 2. 后期维护：发版与更新的完整流程

### 2.1 两条线必须分开（这是设计，不是洁癖）

| | 开发（`glass-plugin/`） | 对外发布（npm 上的包） |
|---|---|---|
| 内容 | 全部源文件 + 归档 + 日志 + 抓图 | 按 `package.json` 的 `files` 白名单（**21 条**）挑出的文件 |
| 版本号 | 随便改 | **必须先在 `release-manifest.json` 登记**，且**发过一次永久锁定** |

`release-manifest.json` 是**公开版的唯一事实来源**，由 `check-release-gates.js` 强制。
目前登记：`0.1.4` / `0.1.5` / `0.1.6`，均 `published`。

### 2.2 发新版的步骤（照抄即可）

```powershell
cd E:\deepseek-v4-flash\glass-plugin

# 1) 改 package.json 的 version，并在 release-manifest.json 里登记一条（channel: stable）
#    ⚠ 不登记的话闸门会直接拦住

# 2) 过闸门（版本已登记、未重发、通道对应、白名单不含开发产物）
node ..\dsh-ui-lab\tools\check-release-gates.js

# 3) 生成对外副本并核对（让你"看见"用户会拿到什么）
node ..\dsh-ui-lab\tools\build-public-release.js --clean

# 4) 发布（脚本会再跑一次闸门，不通过就中止）
npm run publish:stable        # → npm latest
npm run publish:snapshot      # → npm snapshot（自动加 -snapshot.<日期>.<随机> 后缀）
```

**发布后必做**（脚本不会替你做）：

```powershell
# 5) 更新完整性清单（README/package.json 等改了才需要）
node scripts\make-integrity.mjs

# 6) 提交 + 打 tag + 推 GitHub（tag 名与提交标题都遵循下面 §2.4 的格式）
git add -A
git commit -m "0.1.7——液态玻璃"
git tag v0.1.7
git push origin main --tags

# 7) 建 GitHub Release，标题用同一句"0.1.7——液态玻璃"，
#    附件上传 install-liquid-glass.cmd（ASCII 名，见 §2.3）
```

### 2.3 ⚠ GitHub Release 附件名的硬限制

**Release 附件名不支持非 ASCII** —— 上传 `安装插件.cmd` 会退化成无意义的 `default.cmd`。
所以：

- 仓库里的源文件保留中文名 `安装插件.cmd`（**它就是用户下载的那份**）
- 上传时改用 ASCII 副本 `install-liquid-glass.cmd`（同名文件，内容相同）
- **两份必须同步修改**，否则用户下载到的和仓库里的不一致

**已发生过一次不一致**：仓库里的 `install-liquid-glass.cmd` 被改成了增强版（4708 B），
而 Release v0.1.6 上挂的还是旧版（3515 B）。**处理见 §4.5。**

### 2.4 提交信息格式（用户明确要求）

**简短，不要 `+` 连接的链式描述。** 形如：

```
0.1.5——液态玻璃
0.1.6——液态玻璃
```

**⚠ 历史坑**：用 PowerShell 的 `UTF8Encoding($true)` 写提交信息会带 `U+FEFF` BOM，
提交标题会变成乱码。必须用 `UTF8Encoding($false)`。已写入提交规范。

### 2.5 国内用户优先（用户的明确要求）

> "我要优先确保国内用户是可以正常用的"

- 安装走 **npm**，国内自动走 `registry.npmmirror.com`
- **每次发版后核对镜像是否同步**：
  ```powershell
  (Invoke-WebRequest 'https://registry.npmmirror.com/dsh-plugin-liquid-glass' -UseBasicParsing).Content |
    ConvertFrom-Json | % { $_.'dist-tags'.latest }
  ```

### 2.6 插件市场提交（还没做，见 §4.6）

入口文件已就绪：`docs/market-entry.yml`（`url` / `name` / `category: ui` / 中英描述）。
流程与自检清单见 `docs/MARKET-SUBMIT.md`。

**⚠ 硬性前提**：目标仓库 `awesome-dsh-plugin/awesome-dsh-plugin` **会查插件仓库创建是否满 1 天**。
本插件仓库建于 `2026-10-04T09:29:06Z`，**所以 2026-10-05 09:29 UTC（北京时间 17:29）之后**才满足。

---

## 3. 已解决的问题（本次会话，全部有实测证据）

### 3.1 录屏卡顿：DSH 与 OBS 不在同一块显卡

**症状**：开 OBS 录屏时界面卡，尤其开场动画，但 CPU/GPU/内存都没吃满。

**实测到的真因**（不是"资源不够"）：

```
显示器接在 AMD 核显；DSH 走默认 = 核显
OBS 的图形首选项 = 高性能 = 独显 NVIDIA
→ 采集要跨卡拷贝，帧调度被拖住（利用率不高但延迟大）
```

**处置**：给 DSH 写入高性能首选项，你实测反馈 **"流畅许多"**。

```powershell
# 生效：完全重启 DSH
New-ItemProperty -Path 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' `
  -Name 'E:\Deepseek\DeepSeek Harness.exe' -Value 'GpuPreference=2;' -PropertyType String -Force

# 撤销：
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' `
  -Name 'E:\Deepseek\DeepSeek Harness.exe' -Force
```

**顺带查清的两件事**：
- **NVENC 用不了**：OBS 日志 `[NVENC] Test process failed: outdated_driver`。
  你的驱动 `566.36`（2024-12）低于 OBS 32.2 要求的 **570**（OBS 把 NVIDIA SDK 升到 13）。
  **但不必为录屏升驱动** —— 实测你现在走的是 `fallback-amf-h264`（**AMD 硬件编码**，
  不是软件 x264），三段录制共丢 20 帧 / 0.4%，质量已经够用。
- pnpm 装包降级那次是**误判**（详见 §3.5）。

### 3.2 开场动画期间的弹窗时序

**要求**（用户原话）："开场动画绝对不能有弹窗"、"移到动画结束后弹出"、
"我记得开场结束后还有个弹窗，跟那个错开"。

**实现**：新增 `whenIntroSettled(fn, label)`（轮询 `window.__dshGlassIntroActive`，硬上限 45s）
把**画质选择器**和**浅色模式说明**都挂上去；再加 `queuePopup(fn)` 让两个弹窗**依次**出现
（间隔 400 ms），不再叠在一起。**已在你机器上真机验证通过。**

### 3.3 首次安装画质选择器

按你的要求：**不自动检测环境**，首次装完直接弹窗让用户选；**不讲档位说明**（移除每档 hint）；
**没有跳过按钮**；带 20 秒自动取默认值的兜底。

### 3.4 开发版浅色解锁不能进公开版

你要求"不要给我开发版的浅色模式搬过去了"。已核实：

- 公开版行为未变：`THEME_LOCK_ENABLED = true`，无 localStorage 后门
- 唯一合法解锁仍只有 `~/.dsh/glass-theme-lock-off` 标记文件
- **`npm pack` 产物里 0 个主题锁定相关文件**
- 曾经短暂引入的 `themeLockLocalOff` / `THEME_LOCK_LOCAL_KEY` **已彻底移除**（0 处出现）

顺带修掉一个真 bug：主题锁定在"退出口生效"时仍会先执行一次强制纠正，
因为读取标记是异步的而 `enforce('boot')` 先跑了。现在 deferral 移到第一次纠正**之前**。

### 3.5 安装时会静默装到旧版本？—— 两次结论，最后是**没有这个问题**

记录这次反复，避免下一个人重踩：

1. 我第一次实测 `dsh plugin add dsh-plugin-liquid-glass` 装到 **0.1.4**（不是 0.1.6），
   当时的解释是 pnpm 11 的 `minimumReleaseAge`（供应链防护）挡掉了"太新"的版本。
2. 但**严格复测 5 次全部拿到 0.1.6**，且 `pnpm view` 两个源都报 `latest = 0.1.6`。
3. **结论：第一次是镜像元数据不完整的瞬时状态**，元数据补齐后正常解析到最新版。

**⚠ 方法论教训**：那次我把"时间上的先后"当成了因果，得出"用户会拿到 0.1.4"的错误结论，
而当时用户正在发宣传 —— **单次观测不足以定论，结论前必须复测**。

**仍然保留的保险**：`install-liquid-glass.cmd` 里用了
`add dsh-plugin-liquid-glass@latest --config.minimumReleaseAge=0`，
作用是在镜像元数据滞后时**避免静默降级**（代价是关掉 pnpm 一道防护，仅此一次安装）。

### 3.6 安装脚本拿到的版本与报错可读性

**实测「发出去的那份」**（从 GitHub Release 下载原件，3515 B，
sha256 `5f83b1629968593b…`，与仓库 `安装插件.cmd` 相同）：

```
全新 profile 实跑 → + dsh-plugin-liquid-glass 0.1.6   ✓ 拿到最新版
```

**⚠ 但它报错时列的三条原因里没有 `ERR_PNPM_UNEXPECTED_STORE`** ——
而那是真实会发生的失败（在"profile 已有 pnpm 10 建的 node_modules"时稳定复现）。
撞上的用户会看到一堆 pnpm 原始报错 + 对不上的原因。

**已写好增强版（4708 B，未上传）**：加了该报错的人话解释，
并把安装命令换成 `@latest --config.minimumReleaseAge=0`。

---

## 4. 未解决的问题（诚实清单）

### 4.1 ❌ 侧栏工作区的玻璃断层（**未解决，且有回归**）

**症状**：滚动会话列表时，玻璃在某条水平线上截断，**那条线随滚动位置移动**；
展开"其余 N 个会话"后更明显。

**已定位到的机制**（有实测数据支撑）：

```
[data-dsh-glass-block] 被标在 _9lTDKa_list 上 —— 而它 overflow: auto
Chromium 下滚动容器上的 backdrop-filter 采样不随滚动稳定更新
→ 模糊沿一条随 scrollTop 移动的线截断
```

**我做过的尝试与结果**（按顺序）：

| 尝试 | 结果 |
|---|---|
| ① 保持原样（材质挂 `_list`） | 断层存在 |
| ② 跳过滚动容器，改挂父层 `_9lTDKa_treeBody` | 断层仍在；**并且引入了新抖动** —— 采样数据显示材质在 `_list` 与 `_treeBody` 之间来回切换（`gapBelowList` 在 0/24 之间跳），造成"跳一跳" |
| ③ 挂"最外层候选" | 选到了整条侧栏 `BynINW_sidebarCol`（714 px），**更糟**，已放弃 |

**当前代码状态**：开发目录里是**尝试②**（`isScrollableEl()` + 跳过可滚动元素）。
它**没有解决问题**，且带来抖动。

**还查明的相关事实**：
- 材质元素高度**恒为 463 px**，不跟内容变（内容 7 行时底部空 195 px）→ 这就是"大层包小层"
- 该高度由官方布局决定，**换挂哪一层都绕不开**
- `[data-dsh-glass-block]` 的规则里有 `height` 概念可调，但需要改布局，会影响滚动行为

**用户最后的态度**："算了，这个先这样"、"不要这一小块了，直接工作区整块玻璃，不然跳一跳的"。

**建议的下一步**（未验证）：材质挂到**工作区根容器**（含标题 + 项目行 + 会话行，h=505，
`overflow: visible`），并配 `height: fit-content; max-height: 100%` 让材质跟随内容高度。
**⚠ 必须先测"短内容/长内容/滚动"三种情况再上**，别再边改边试。

### 4.2 ⚠ 设置界面玻璃（**代码已写，你已确认效果，但只在你机器上验证过**）

- **改动**：`artifacts/client.js` 弹窗识别加上 `[role="dialog"]`；
  `artifacts/50-glass-surfaces.css` 新增 `[data-dsh-glass-popup][role="dialog"]` 规则
  （含低画质档兜底）。
- **你反馈**："效果还不错，这个就定下吧"。
- **⚠ 但这只在本机测过**。发布前仍应确认三条：面板整体观感、左侧导航选中态、各画质档表现。
- **依据的实测数据**：面板 `wCInkW_panel` 800×632 / 圆角 28 px / 唯一实色层是导航选中态
  `rgb(67,69,74)` / **面板内无滚动容器**（所以不会有 §4.1 那种裁断）/
  白字对比度 **16.96:1**（官方实色是 12.54:1，WCAG 门槛 4.5:1）。
- `[role="dialog"]` 在本页**只有设置面板使用**，所以不会误伤其它对话框。

### 4.3 ⚠ 壁纸插件下的性能优化（未开始）

用户反馈：跟 `dsh-plugin-wallpaper-engine` 同用时"肉眼可见的卡顿"。

**已查清的机制**（来自 Chromium 合成器文档）：

```
壁纸每帧产生 damage
  × 11 处 backdrop-filter（其中顶栏 inset:0 是整幅宽度）
  → Chromium 把 damage 扩张到【整个玻璃元素的范围】
  → 每帧重绘 + 重采样 + 重新模糊一大片
```

**插件没有"直接"责任**：全代码搜索确认它**不会暂停/隐藏外部画布**，壁纸在场时也不加额外特效，
且能正确识别 `data-we-wallpaper` 并让位（自己的背景层转透明）。

**建议方案（未实施、未测收益）**：壁纸在场时自动降低模糊半径（方案 A，纯 CSS，风险最小）；
再给用户一个开关（方案 C）；"去掉顶栏/侧栏实时模糊"（方案 B）属视觉决策，需用户点头。

### 4.4 ⚠ 插件市场条目（未提交）

见 §2.6。**前置条件时间已过**，可以提交了。

### 4.5 ⚠ 三处待收尾的不一致

| 项 | 现状 | 建议 |
|---|---|---|
| Release 附件 | v0.1.6 上是旧版脚本（3515 B，报错提示过时） | 换成增强版（4708 B）|
| 仓库两份安装脚本 | `安装插件.cmd` = 3515 B（原始）；`install-liquid-glass.cmd` = 4708 B（增强） | **两份要同步**，否则下载到的与仓库里的不同 |
| npm 包内 README | 缺 `.cmd` 安装小节（仓库 README 已领先） | 下次发版带上 |

### 4.6 预存在的清理项（不影响用户，但脏）

- `artifacts/` 下留着 `client.js.before-prune` / `.before-restore` / `.glass-fixed`、
  `ui-capture-*.json`、`layout.jsonl` 等诊断产物（**按设计不进还原点与 npm 包**）
- `_archive-2026-10-01-*` / `_backup-before-separation`（55 个文件，1.9 MB）是 10-01 的手工转储，
  里面是**旧版**源码；最早的还原点 `20261001-230258` 比它们更早，恢复能力已覆盖
- 你的 profile 有个历史备份 `profiles/desktop.bak-20260929-234446`

---

## 5. 还原点（改危险代码前必打）

入口是 `save.js`，**它走的是 `tools.js` 的 `discover()`（规则化发现）**。

```powershell
cd E:\deepseek-v4-flash\dsh-ui-lab
node rollback\save.js <标签>                       # 打点（内含 19 项闸门自检）
node rollback\restore.js <目录名|latest>            # 还原
node rollback\restore.js <目录名> --dry             # 只预览
node rollback\verify-restore.js <目录名|latest>      # 校验
```

**⚠ 本次会话修正了 `tools.js` 的 `RULES`**（用户要求"还原点必须保存整个插件备份"）：

- 原来插件根目录只收 `EXT_SRC` → **漏掉 `安装插件.cmd` / `install-liquid-glass.cmd` /
  `LICENSE` / `AUTHOR-NOTICE.txt` / `verify-integrity.mjs` / `.gitignore` / `.npmignore`**
- 现在补齐，并新增 **`plugin-dist`**（`dist/<版本>/` 交付包，30 个文件）与 **`plugin-scripts`**
- 同时修了 `listDir` / `listTop` 的一个真实缺陷：旧写法把 `prefixes` 当互斥分支
  （写了 `prefixes` 就忽略 `exts`），导致"既要 `.json` 又要 `LICENSE`"的规则只能二选一
- 产出：**648 → 690 个文件**；**排除**的仍是日志、抓取 dump、历史归档（按设计）

**⚠ 要调"什么该进快照"，改 `tools.js` 的 `RULES`，不要改 `snapshot.js`** ——
`snapshot.js` 是旧流程遗留，`save.js` **不读它**（本次曾误改它，等于没改）。

---

## 6. 硬约束（违反会出真问题）

1. **绝不在承载 `backdrop-filter` 的元素上动画 `opacity`/`transform`** ——
   Chromium 会提升独立合成层、打断 backdrop 采样，材质变平。动画必须加在**祖先 wrapper** 上。
2. **一个可视属性只能有一个归属**（闸门管 `visibility`，动画管 `opacity`/`transform`），
   两个归属必然抢帧。
3. **绝不缩放文字。**
4. **重启必须由用户手动做。** AI **不许**杀/重启桌面应用（agent 运行器寄生其中，会被一起杀掉）。
5. **绝不要把注入脚本插进 `#root`** —— 会卡在 "Loading plugins…"。
6. 打包版**没有 Reload Page 菜单**，`Ctrl+R` 无效。
7. **材质不要放在可滚动容器上**（§4.1 的根因）。
8. **发布过的版本号永久锁定**，不能在同一个版本号下重生成 `INTEGRITY.json` 来"消掉警告"。

---

## 7. 用户偏好（务必遵守）

- **验证标准**："不能因为这一次应付我" —— 必须实测，不许只靠推断；结论要能指出证据出处。
- **失败要直说**：他明确说过"不要搞我了"。**反复改但没测通比承认没解决更糟。**
- **开发版与公开版严格分开**："跟我的开发版本隔开，因为这里我要乱折腾的"。
- **提交信息简短**，不要链式描述（§2.4）。
- **不要把开发版特性搬进公开版**（浅色模式解锁就是例子，§3.4）。
- **视觉决策要问**：动顶栏、侧栏这类"看得见的设计"，先问再改。

---

## 8. 盲点（我没验证的，别当成已验证）

- §4.2 设置界面玻璃的真实观感 —— 只有你的主观确认，我合成的预览是**近似**（真实环境里
  backdrop 擦到的是侧栏而非壁纸）
- 用户机（全新 Windows 账户 / 新装 DSH）的 `profiles/desktop` **是否预置 `node_modules`** ——
  决定 `ERR_PNPM_UNEXPECTED_STORE` 会不会影响所有用户。**本机为 10 MB 且不含 `@deepseek-ai`，
  看起来只装了插件**，但我无法从这里确认全新安装的状态
- 工作区玻璃的任何修法 —— 三次尝试都没解决，§4.1 的建议方案**完全没测过**
- 壁纸场景降模糊的实际收益 —— 机制分析有据，但**没有帧率对比数据**
