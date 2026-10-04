# 发布手册（v0.1.4）

给不了解发布流程的自己看。**按顺序做，每步都有"怎么确认成功了"**。

---

## 先理解两条路（它们管不同的事）

| | npm | GitHub |
|---|---|---|
| **作用** | **用户装插件用** | 给人看代码、看更新说明 |
| **国内可达** | ✅ 有淘宝镜像自动同步（实测 57ms） | ❌ github.com 实测超时 12 秒 |
| **要装工具吗** | 不用（你已有 node/npm） | **要装 git** |
| **能裁剪开发产物吗** | ✅ `files` 白名单 → 2.4MB | ❌ 拉整个仓库 |

**结论：npm 是必须的（否则国内用户装不上），GitHub 是加分项。**

两条路互不冲突：GitHub 放源码，npm 放"给用户装的干净包"。

---

# 第一步：发布到 npm

## 1.1 登录（只需一次）

```powershell
npm login --registry=https://registry.npmjs.org/
```

**会发生什么**：终端显示一个网址 + 短码 → 浏览器自动打开 → 登录你的 npmjs.com 账号 → 点"授权"。

**⚠ 必须带 `--registry=`**：你的 npm 指向淘宝镜像（只读，不能登录、不能发布）。带上这个参数**不会改你的全局配置**，日常装包仍然走镜像。

**怎么确认成功**：
```powershell
npm whoami --registry=https://registry.npmjs.org/
```
能打印出你的用户名就是成功了。

**⚠ 没注册过 npm 账号？** 先去 https://www.npmjs.com/signup 注册，并**验证邮箱**（不验证邮箱发布会失败）。

## 1.2 发正式版（0.1.4）

```powershell
cd E:\deepseek-V4-flash\glass-plugin
npm run publish:stable
```

脚本会自己做完这些事：
1. 跑**发布闸门**（版本已登记 / 未重发 / 通道对应 / 白名单干净）——不通过就直接中止
2. 检查你是否已登录官方源（没登录会直接告诉你要敲哪条命令，而不是抛 `ENEEDAUTH`）
3. 发布到 npm 的 `latest` 标签
4. **自证通道隔离**（latest 有没有被误改、国内镜像能不能读到）
5. **自动把 0.1.4 记进台账并锁定**（此后这个版本号不能重发）

**怎么确认成功**：
```powershell
npm view dsh-plugin-liquid-glass version --registry=https://registry.npmjs.org/
# 应输出 0.1.4

# 国内镜像（通常几分钟内同步）
curl.exe "https://registry.npmmirror.com/dsh-plugin-liquid-glass/latest"
```

## 1.3 发快照版（可选，建议第一次发布时也发）

```powershell
npm run publish:snapshot:dry   # 先看会发成什么版本号（不真发）
npm run publish:snapshot       # 真发
```

会发布成 `0.1.4-snapshot.<日期>.<随机>`，进 `snapshot` 标签。
**它不会影响 latest**（脚本会自证这一点），且**永远小于同号正式版**——所以不会把用户从正式版"顶上"去。

用户在「设置 → 液态玻璃 → 启用快照版更新」开启后，才会查到它。

## 1.4 装了插件的人怎么更新

他们在这个插件的设置页点「检查更新」：
- 没开快照开关 → 查 `latest`（正式版）
- 开了快照开关 → 查 `snapshot`（预览版）

---

# 第二步：推到 GitHub

## 2.1 装 git（必须先做）

**下载**：https://git-scm.com/download/win

安装时**一路默认即可**，只有一处注意：如果是中文界面，遇到 "Adjusting your PATH environment" 保持默认（"Git from the command line and also from 3rd-party software"）。

**怎么确认成功**（**新开一个** PowerShell 窗口）：
```powershell
git --version
```

## 2.2 在 GitHub 网页上建仓库

1. 打开 https://github.com/new
2. **Repository name** 填：`dsh-plugin-liquid-glass`（和你 npm 包名一致，好认）
3. **Description**（可选）：`DSH 液态玻璃界面插件 · Liquid Glass surfaces for DeepSeek Harness`
4. **Public / Private**：选 **Public**（开源）
5. **⚠ 下面三个勾全部不要勾**：
   - ❌ Add a README file
   - ❌ Add .gitignore
   - ❌ Choose a license
   
   （你的项目里已经有这些文件了，勾了会造成冲突）
6. 点 **Create repository**

**建完之后**：GitHub 会显示一个页面，上面有仓库地址，形如
`https://github.com/smj-1680/dsh-plugin-liquid-glass.git`
**把这个地址复制下来**，下一步要用。

## 2.3 把本地代码推上去

在 PowerShell 里**逐条**执行（用户名已填好，直接复制即可）：

```powershell
cd E:\deepseek-V4-flash\glass-plugin

git init
git add .
git commit -m "feat: 首个公开版 0.1.4 —— 液态玻璃界面 + 画质档位 + 更新检查"
git branch -M main
git remote add origin https://github.com/smj-1680/dsh-plugin-liquid-glass.git
git push -u origin main
```

**第一次 push 会要求登录 GitHub**：
- 弹窗登录（Git Credential Manager）→ 直接在浏览器里授权即可，**最简单**
- 若要手动输入：用户名填 GitHub 用户名，**密码位置要填 Personal Access Token**（不是账号密码）
  - 建 token：https://github.com/settings/tokens → Generate new token (classic) → 勾 `repo` → 复制

## 2.4 推之前先确认"不会传上去垃圾"

**这一步很重要**——仓库一旦公开，那些开发产物（约 13MB 的诊断日志、备份、抓图）就会被所有人下载。

```powershell
cd E:\deepseek-V4-flash\glass-plugin
git status --short | Measure-Object -Line      # 看有多少文件将被提交
git ls-files | Select-String "_archive|_backup|\.log$|ui-capture|dist/"   # 应当【没有输出】
```

如果最后一条**有输出**，先停下来 —— 说明 `.gitignore` 没起作用，告诉我，我来修。

## 2.5 打 tag 与建 Release（可选，但推荐）

用户在 GitHub 上看"哪个版本更新了什么"靠这个：

```powershell
git tag -a v0.1.4 -m "0.1.4"
git push origin v0.1.4
```

然后到 https://github.com/smj-1680/dsh-plugin-liquid-glass/releases → Draft a new release → 选 `v0.1.4` → 写更新说明 → Publish。

**快照版**：同样建 Release，但**勾上 "Set as a pre-release"**。

---

# 第三步：上架插件市场（可选）

市场注册表在 `awesome-dsh-plugin/awesome-dsh-plugin` 仓库。你的插件要在市场里被搜到，需要在它的 `plugins.json` 里有条目。

**收录方式**：到那个仓库看 README 的贡献说明（提交 Issue 或 PR）。**这一条我没有实测过**，不做保证。

给维护者的条目长这样（字段名取自真实条目）：

```jsonc
{
  "name": "dsh-plugin-liquid-glass",
  "owner": "smj-1680",
  "url": "https://github.com/smj-1680/dsh-plugin-liquid-glass",
  "category": "ui",
  "description": {
    "en": "Liquid Glass surfaces for DeepSeek Harness: Apple-style refracted glass on the composer, message bubbles and the assistant card.",
    "zh": "DSH 液态玻璃：给输入框、消息气泡与助手卡片做 Apple 风格折射玻璃。"
  },
  "npm": "dsh-plugin-liquid-glass",
  "version": "0.1.4"
}
```

---

# 发布后自检（用户视角）

```powershell
# 1) 包在不在
npm view dsh-plugin-liquid-glass --registry=https://registry.npmjs.org/

# 2) 国内镜像能不能读到（国内用户靠这个）
curl.exe "https://registry.npmmirror.com/dsh-plugin-liquid-glass/latest"

# 3) 装到一个临时 profile 里试
#    （桌面端 profile 由应用独占，别直接动它）
```

---

# 常见问题

**Q: `npm login` 报 `ENEEDAUTH`**
A: 没带 `--registry=https://registry.npmjs.org/`。你的全局 registry 是淘宝镜像，只读。

**Q: 发布报 `403 Forbidden`**
A: 邮箱没验证，或包名已被别人占用。

**Q: 发布报 "You cannot publish over the previously published versions"**
A: 这个版本号发过了。**npm 不允许覆盖已发布的版本号** —— 改 `package.json` 的 `version`，并在 `release-manifest.json` 里登记新版本，再发。

**Q: `git push` 要求密码，但我不知道密码**
A: GitHub 不能用账号密码推代码。要么用弹窗登录，要么把 Personal Access Token 当密码填。

**Q: 我想改版本号怎么改**
A: 三处要一致（回归会检查其中两处）：
1. `package.json` 的 `version`
2. `lib/client.js` 的 `GLASS_VERSION_STABLE`
3. `release-manifest.json` 里加一条记录（`channel` 填 `stable`）
然后跑 `node E:\deepseek-V4-flash\dsh-ui-lab\tools\check-release-gates.js` 确认通过。
