# 桌面端接入 · 开关与回滚

> 本次接入的核心原则：**默认关闭、随时可回滚、失败不影响 app。**

---

## 一、开关（两选一）

```powershell
# a) 放一个开关文件（相对插件目录，别写绝对路径）
New-Item -ItemType File -Path ".\embed\ENABLED" -Force

# b) 或设环境变量（需重启桌面端才生效）
$env:DSH_GLASS_EMBED_UI = "1"
```

`embed/install.js` 由 `lib/index.js` 顶层静态 import，未启用时返回空行，**完全不影响现有行为**。

---

## 二、回滚（从轻到重）

| 粒度 | 操作 | 影响 |
|---|---|---|
| **① 只关新 UI** | 删掉 `embed/ENABLED` | 新 UI 消失，原玻璃效果不变 |
| **② 回到官方版本（推荐）** | `dsh plugin --profile desktop add dsh-plugin-liquid-glass` | 覆盖成官方发布版，本核验随后应显示「未做任何修改」 |
| **③ 确认自己改没改过** | `node verify-integrity.mjs` | 逐文件比对官方 SHA-256 清单 |

**②是用户最该用的那条**：本插件是 MIT 开源，你可以随便改，但改坏了由修改者自负；
重装一次就能干净地回到官方版本。

---

## 三、出问题的判断顺序

1. **桌面端起不来/卡死** → 删 `embed/ENABLED` 并重启；
2. **新 UI 没出现** → 看控制台是否有 `[glass-ui]` 日志（未启用会有提示）；
3. **原有玻璃效果也没了** → 说明有人改了 `lib/` 或 `artifacts/` → 跑 `node verify-integrity.mjs`
   确认是否被动过，然后按 ② 重装。

---

## 四、为什么默认关闭

之前有过一次「桌面端第二次重启后卡死」（未证实原因，但时间点与"插件启动期做重活"吻合）。
所以这次：
- **默认关闭**，不改现有行为；
- 装载**只做三件事**：插一段 style、插一段标记、插一段脚本 —— 无轮询、无 DOM 克隆、无监听；
- 任何异常只 `console.warn`，绝不 throw 到宿主。
