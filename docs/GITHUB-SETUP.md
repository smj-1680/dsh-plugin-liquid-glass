# GitHub 开源步骤（0.1.4 已发布到 npm 之后）

> 逐条复制即可。每条后面写清「成功会看到什么」，卡住就停下把输出发我。

---

## 为什么值得做（哪怕 npm 已经能装了）

| 渠道 | 作用 |
|---|---|
| **npm** | ✅ **已完成**。用户实际安装走这里（国内走淘宝镜像，实测 1.8 秒） |
| **GitHub** | 给人看代码、提 issue、fork；**而且插件市场要求先有仓库** |
| 插件市场 | 卡片展示（你截图那个），靠 GitHub 仓库 + 一条注册表条目 |

**关键先后**：市场要求仓库**创建满 1 天**才会收条目（CI 自动查）。所以**越早建仓库越好**。

---

## 步骤 0：装 git

**下载**：https://git-scm.com/download/win

一路默认即可。**装完必须新开一个 PowerShell 窗口**（旧窗口的 PATH 不会更新）：

```powershell
git --version
```

**成功**：打印形如 `git version 2.x.x.windows.1`

---

## 步骤 1：网页建仓库

打开 https://github.com/new

| 字段 | 填什么 |
|---|---|
| **Repository name** | `dsh-plugin-liquid-glass` ← 必须和 npm 包名一致 |
| Description | 可留空（市场不读这里） |
| Public / Private | **Public** |

### ⚠️ 三个勾全部不要勾

```
❌ Add a README file
❌ Add .gitignore
❌ Choose a license
```

**理由**：仓库里已经有这三个文件了，勾了会让 GitHub 先建一次、你推送时冲突。

点 **Create repository**。

**成功**：跳到仓库页，显示一段"quick setup"命令。

---

## 步骤 2：推代码（逐条复制）

```powershell
cd E:\deepseek-v4-flash\glass-plugin

git init
git add .
git commit -m "feat: 首个公开版 0.1.4 —— 液态玻璃界面 + 五档画质 + 开场动画 + 双更新通道"
git branch -M main
git remote add origin https://github.com/smj-1680/dsh-plugin-liquid-glass.git
git push -u origin main
```

### ⚠️ 推送前先做这一步检查（很重要）

在 `git commit` **之后**、`git push` **之前**，敲：

```powershell
git ls-files | Select-String "_archive|_backup|\.log$|ui-capture|dist/|before-prune|before-restore"
```

**应该没有任何输出。**

如果有输出 → **先停下，别 push**，把输出发我。那意味着约 13MB 的开发产物（诊断日志、手工备份、UI 抓包）会跟着进仓库，每个从 GitHub 装的人都得下载。

### 第一次 push 会要求登录

- **最简单**：弹出的浏览器窗口里授权
- 若要手填：用户名填 GitHub 用户名，**密码位置填 Personal Access Token**（不是账号密码）
  - 建 token：https://github.com/settings/tokens → Generate new token (classic) → 勾 `repo` → 复制

**成功**：看到 `main -> main` 之类的推送进度，仓库页面出现你的文件。

---

## 步骤 3：加 topic（市场要求）

仓库页 → 右上 **⚙ About** → **Topics** → 输入 `dsh-plugin` → 保存

**成功**：仓库标题下方出现 `dsh-plugin` 标签。

---

## 步骤 4：建 Release（推荐）

```powershell
git tag -a v0.1.4 -m "0.1.4"
git push origin v0.1.4
```

然后 https://github.com/smj-1680/dsh-plugin-liquid-glass/releases → **Draft a new release** → 选 `v0.1.4` → 写更新说明 → **Publish release**。

**⚠ 快照版**：同样建 Release，但要勾 **Set as a pre-release**（市场要求两条通道隔开）。

---

## ★ 到这一步，计时开始

市场注册表的硬性要求（原文）：

> *"The repo is at least 1 day old. **This is checked automatically.** 仓库创建满 1 天。"*
>
> 原文解释：*"这不是对质量的评价——它挡掉的是『PR 前几分钟才建的仓库』。如果你只是差一点，把功能做完再提交即可，重新提交不会有任何影响。"*

**所以建完仓库要等 24 小时才能提市场条目。**

---

## 步骤 5：明天提市场 PR

**一个 PR 只加一个文件**：

```
data/plugins/smj-1680__dsh-plugin-liquid-glass.yml
```

文件名规则：**owner 全小写** `__` 仓库名。内容用仓库里现成的：
`docs/market-entry.yml`

（用 GitHub 网页操作即可：fork 那个仓库 → 在 `data/plugins/` 下新建文件 → 粘贴内容 → 提 PR。）

CI 会检查的项，我已逐条核对过你的插件，**全部满足**：

| 检查 | 你的状态 |
|---|---|
| `package.json` 声明 `dsh.bundle` | ✅ `patch: ./cordis.patch.yml` |
| 只声明 `dsh.client` 会失败（**最常见的打回原因**） | ✅ 两个都有 |
| 仓库有真实可用代码 | ✅ |
| 仓库满 1 天 | ⏳ 从步骤 1 起算 |
| 描述准确、无营销词 | ✅ 每条都能对上代码 |
| 分类贴合 | ✅ `ui` |

---

## 附：以后要发新版本时

`release-manifest.json` 里 **0.1.4 已锁定为 published**，所以：

1. 改 `package.json` 的 `version`（例如 `0.1.5`）
2. 在 `release-manifest.json` 的 `releases` 数组加一条（`channel: "stable"`, `status: "planned"`）
3. 重生成完整性清单：`node scripts/make-integrity.mjs`
4. 重生成对外副本：`node ../dsh-ui-lab/tools/build-public-release.js --clean`
5. 发布：`npm run publish:stable`

**不登记就直接发会被发布闸门拦住**（R3：当前版本必须显式登记在台账里）。
