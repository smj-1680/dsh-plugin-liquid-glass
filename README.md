# dsh-plugin-liquid-glass

适用于 DSH 桌面端的液态玻璃美化插件。输入框、消息气泡、侧栏与顶栏等主要界面元素
改为液态玻璃材质，可搭配各类壁纸插件使用（需深色模式）。

> Liquid-glass beautification plugin for DSH desktop. Gives the composer, message
> bubbles, sidebar, top bar and menus a liquid-glass material. Works alongside
> wallpaper plugins. Dark mode only.

**覆盖范围**（市场会拿描述对代码核查，所以写清楚实际做了什么）：
输入框（真折射）· 用户消息气泡 · 助手回复卡片 · 侧栏工作区块 · 顶栏与标签页 ·
右侧栏面板 · 侧栏控件药丸 · 菜单与弹窗材质。

**与壁纸插件的关系**：按"能力"而非"品牌"判定是否已有壁纸在场，分三层探测
（显式契约 / 各家已知钩子 / 通用结构判据），因此**各种壁纸插件都能搭配使用**。
你也可以用 `data-dsh-glass-canvas="off"` 显式关掉插件自带的背景。

> **状态：v0.1.4（首个公开版，已发布到 npm）**
>
> - **只适配 DSH 桌面端**。浏览器环境会**整体停用**（不注册任何 UI、不改动界面），
>   并弹一次说明。这不是"没测过浏览器"，是明确不支持。
> - **暂不适配浅色模式**。v0.1.4 的材质只针对深色底调过，所以外观会被锁定在深色；
>   点「浅色」或「跟随系统」会被拦下并说明原因。
>   如需解除锁定：在 `~/.dsh/` 下创建空文件 `glass-theme-lock-off`。
> - 已在 Windows 桌面端实测（材质、开场、主题锁定、更新通道均可用）。

---

> ## ⚠️ 请先读这一段（尤其是想改代码的人）
>
> 本插件是**开源软件**（MIT）。你**可以**随意修改它 —— 但请先明白三件事：
>
> **1. 改了就不是官方版本了。** 一旦你（或你用的 AI）改动过源码，
> 之后出现的任何问题**由修改者自行承担**，开发者**不负责修复**。
> 这是 MIT 许可证的正式条款（`LICENSE` 里有完整的 AS IS 段落与修改说明），
> 不是口头声明。
>
> **2. 你能在 5 秒内知道自己改没改过。** 在插件目录下执行：
>
> ```bash
> node verify-integrity.mjs
> ```
>
> 它会逐文件比对官方发布的 SHA-256 清单：
> - 显示「**未做任何修改**」→ 你这份是官方版本，有问题尽管反馈
> - 显示「**这份代码被动过**」→ 已经被改过，请先重装回官方版本再排查
>
> **3. 想恢复官方版本，重装一次即可：**
>
> ```bash
> dsh plugin --profile desktop add dsh-plugin-liquid-glass
> ```
>
> ---
>
> **为什么加这段**：开源代码挡不住别人修改（那是开源的定义），
> 但"有没有被改过"应该是一个**能判定的事实**，而不是各说各话。
> 所以每次官方发布都会附带逐文件校验清单（`INTEGRITY.json`），
> 让这件事变得可查、可证。

---

## 两条更新通道

用户端「设置 → 液态玻璃 → 启用快照版更新」决定查哪条线：

| 开关 | 查到 | npm dist-tag | 说明 |
|---|---|---|---|
| 关闭（默认） | 正式版 | `latest` | 稳定 |
| 开启 | 快照版 | `snapshot` | 内测，可能不稳定 |

两条线靠 **dist-tag + 预发布版本号**隔开：快照版带 `-snapshot` 后缀，
永远小于同号正式版，所以**不会把用户从正式版"顶上"去**。

### 为什么装插件必须走 npm（而不是 GitHub 源）

实测（2026-10-04，国内网络）：

| 地址 | 结果 |
|---|---|
| `github.com` | 超时 12 秒 |
| `raw.githubusercontent.com` | 连不上 |
| `registry.npmmirror.com`（npm 镜像） | 200 OK，57 ms |

所以：**GitHub 用来给人看代码，npm 用来给用户下载**（国内自动走镜像加速）。
`github:` 源还有一个缺点：它拉取**整个仓库**，没有裁剪机制。
npm 侧靠 `files` 白名单 + `.npmignore` 裁到约 2.5 MB。

---

## 效果

| 位置 | 效果 | 层级定位 |
|---|---|---|
| 输入框（composer） | **真折射** —— SVG 位移贴图 + 模糊 + 指针高光 | 导航层 |
| 用户消息气泡 | 玻璃外观 —— 自发光渐变 + 发丝描边 + 内高光 | 内容层 |
| 助手回复卡片 | 玻璃外观 + 900px 收窄 + 平滑生长 | 内容层 |

关于"导航层 / 内容层"的区分：苹果在 WWDC25 明确玻璃**只适用于导航层**。
输入框悬浮在滚动内容之上、背后有连续滚过的东西可折射，所以做真折射；
消息内容背后只有聊天底，做真折射会扭曲正文、不可读，所以只做玻璃外观。
这个区分不是洁癖，是必要的。

---

## 安装

### 用户：从 npm 安装（推荐，国内可用）

```bash
dsh plugin --profile desktop add dsh-plugin-liquid-glass
```

**为什么必须走 npm**：实测（2026-10-04，国内网络）`github.com` 超时 12 秒、
`raw.githubusercontent.com` 连不上，而 npm 国内镜像 57 ms。
用 `github:` 源还会**拉取整个仓库**（含开发产物，约 13 MB）；
npm 侧靠 `files` 白名单裁到约 2.4 MB。

装完**重启 DSH**（材质样式表需要重新注入）。

### 卸载

```bash
dsh plugin --profile desktop remove dsh-plugin-liquid-glass
```

卸载后界面会回到 DSH 原本的样式 —— 插件只做注入，不改动 DSH 自己的文件。

---

## 开发：改动本仓库时怎么装

下面这些是**开发者自用**的流程，普通用户不需要。

### web profile（仅用于看 CSS 效果；材质逻辑在浏览器上不生效）

```bash
dsh plugin --profile web add link:<本目录绝对路径>
```

### 官方 Electron 桌面端

桌面端的 `desktop` profile **由应用独占管理**，CLI 会直接拒绝：

```
error: profile "desktop" is managed exclusively by the Electron application
```

绕开方式：把配置复制成一个临时 profile 名安装，再把配方同步回去。

```powershell
$P = "$env:USERPROFILE\.dsh\profiles"
Copy-Item "$P\desktop" "$P\glass-tmp" -Recurse
dsh plugin --profile glass-tmp add link:<本目录绝对路径>
# 同步配方（保留 desktop 原有的 cordis.patch.yml）
foreach ($f in 'package.json','pnpm-lock.yaml','cordis.patch.yml','cordis.yml','pnpm-workspace.yaml') {
  Copy-Item "$P\glass-tmp\$f" "$P\desktop\$f" -Force
}
robocopy "$P\glass-tmp\node_modules" "$P\desktop\node_modules" /E
Remove-Item "$P\glass-tmp" -Recurse -Force
```

---

## 为什么用「结构化注入行」而不是 `tapIndex`

这是本插件最关键的设计决定，也是踩坑换来的。

`dsh web` 和官方 Electron 桌面端**把页面送上屏幕的方式完全不同**：

```
dsh web        DSH web 服务器提供 index.html
               → tapIndex 的字符串改写能到达页面

Electron 桌面端  页面由 dsh-app:// 协议从磁盘直读
               (dsh-web-frontend/dist/index.html)
               → index.html 从不经过 web 服务器，tapIndex 永远到不了
```

桌面端真正认可的是**结构化注入表**：`@deepseek-ai/dsh-desktop-host` 会调用
`ctx.webServer.collectIndexInjections()`，把行通过 boot payload 发给页面侧解释器。

行类型是闭集（读自 `@deepseek-ai/dsh-host-webserver`）：

```
global | script | script-src | script-preload | style | html
```

**注意没有 `style-src`** —— 外部样式表无法表达为行，所以 CSS 作为**内联
`style` 文本**下发。这同时是更稳的选择：整个效果不依赖任何路由可达。

插件优先用结构化行（两端通吃），`tapIndex` 仅作为老版本运行时的回退。

---

## 现状（v0.1.4）

### 已在 Windows 桌面端实测通过

- 三处玻璃（输入框真折射 / 用户气泡 / 助手卡片）与侧栏、顶栏、弹窗材质
- **开场动画**：黑场 → 用户视频完整播完 → 三拍（标题 / 卡片行 / 输入框）**同刻**入场
- **首帧遮挡**：黑场层在窗口出现的同一帧就是纯黑，动画前不会露出界面
  （这一条曾经失败过很久，根因与教训见 `lib/client.js` 里 `#dsh-glass-intro` 的注释）
- 画质档位 5 档（极低/低两档关闭磨砂与开场动画）
- 主题锁定（v0.1.4 只适配深色，拦截浅色/跟随系统并弹窗说明）
- 两条更新通道（正式 / 快照），互不串线
- 只适配桌面端：浏览器环境整体停用并说明

### 已知限制

1. **不适配浅色模式** —— 材质只针对深色底调过，所以外观被锁在深色。
   解除方式：在 `~/.dsh/` 下创建空文件 `glass-theme-lock-off`
2. **只适配桌面端** —— 浏览器里整体停用（判据与官方 `detectEnvironment()` 一致）
3. **窗口原生白底** —— 窗口出现到页面首帧之间有约 1 秒显示系统浅色底（深色主题下偏刺眼）。
   **这是 DSH 主进程的窗口配置决定的，插件侧无法修**（没有相应的 IPC 通道）
4. **类名哈希依赖** —— CSS 里有 `[class*="_column"]` 这类选择器，哈希是构建期生成的，
   不同版本的 `dsh-web-frontend` 可能不同
5. **演示光晕** —— `client.js` 顶部的 `GLOW = true` 会插入一块假背景光，接入真实壁纸后应改为 `false`

### 排查问题：怎么打开诊断日志

诊断日志**默认关闭**（发布版不该往用户目录刷日志：开启时一次启动约写 277 行 / 40 KB）。
需要排查时用以下任一方式开启，**不用改代码**：

```js
// 控制台执行后刷新页面
localStorage.setItem('dsh-glass-probe', '1')
```
- 或地址后加 `?dshGlassProbe=1`
- 或控制台执行 `window.__dshGlassProbe = true`（对下一次开生效）

开启后时间线写入 `artifacts/startup-timeline.log`。
**用完请关掉**：`localStorage.removeItem('dsh-glass-probe')`。


---

## 结构

```
dsh-plugin-liquid-glass/
├── package.json           声明 dsh.bundle.patch
├── cordis.patch.yml       挂载声明（- insert: [...]）
├── lib/index.js           服务端：路由 + 注入
├── artifacts/
│   ├── 10-glass-composer.css      输入框
│   ├── 20-glass-bubble-user.css   用户气泡
│   ├── 30-glass-bubble-agent.css  助手卡片
│   ├── 40-ready-gate.css          首帧无过渡门控
│   └── client.js                  客户端 DOM 逻辑（SVG 滤镜 / 指针 / 打标）
└── README.md
```

## 许可

MIT
