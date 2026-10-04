# 提交到 DSH 插件市场（awesome-dsh-plugin）

来源：`awesome-dsh-plugin/awesome-dsh-plugin` 的 `contributing.md`（我读过原文）。
本文件只摘录**你需要遵守的部分**，不替代原文。

---

## 一段话说清机制

市场列表**不是**数据库、也**不是**你插件里的某个文件。它是一个 GitHub 仓库里的
**一个 YAML 文件**：

```
data/plugins/<owner小写>__<repo>.yml      ← 你的条目（一个插件一个文件）
```

**你的仓库和这个 YAML 文件的关系**：YAML 里写 `url: https://github.com/你/仓库`，
市场据此去读你的仓库（README、package.json、stars、npm 下载量）。
所以顺序是：

```
① 你的 GitHub 仓库要先存在（有真实可用的代码）
② 你在那个市场仓库提一个 PR，只加一个 YAML 文件
③ 合并后，两个 README 由脚本重新生成，市场自动显示你的介绍
```

**两个 README 是自动生成的，不要手改**（原文原话：*"The READMEs are generated — don't edit them by hand"*）。

---

## 条目格式（就 4 个字段）

```yaml
url: https://github.com/owner/repo         # 必须与仓库完全一致
name: owner/repo                           # 列表里显示的文字（owner 保持原大小写）
category: ui                               # 见下方分类清单
description:
  en: One-line description ending with a period.
  zh: 一句话描述，以句号结尾。              # 可选；写不了中文可以留空，维护者会补
```

**只有 `description.en` 是必需的。**

> ⚠ **描述里含 `:`（冒号加空格）时必须加引号**，否则 YAML 会把它当成嵌套键：
> ```yaml
> description:
>   en: 'Vision toolkit: OCR, grounding and pixel diff.'
> ```

---

## 可用分类（22 个）

```
agi  ui  usage  theme  model  identity  session  memory  tools  wsl
browser  vision  voice  docs  skill  workflow  git  notify  dev
security  remote  market  fun
```

选**最贴合插件实际做什么**的那个，不要挑"你想让它出现在哪"。
选得不够准，维护者会直接改，不会打回。

**液态玻璃属于 `ui`**（界面增强；`theme` 是主题/皮肤，我们不是——我们不改配色，是加材质）。

---

## 仓库硬性要求（这些会被 CI 自动检查）

1. **`package.json` 里必须声明 `dsh.bundle` manifest**
   （这才是让它能被 `dsh plugin add` 安装的东西）

   ⚠ **只声明 `dsh.client` 不算**——原文写明这是**最常见的打回原因**。完整示例：

   ```jsonc
   {
     "dsh": {
       "bundle": { "patch": "./cordis.patch.yml" },   // ← 必须有
       "client": { "platform": "web" }                // 只有提供浏览器 UI 时才需要
     }
   }
   ```
   旁边还要有一个 `cordis.patch.yml`：
   ```yaml
   - insert:
       - id: your-plugin-id
         name: your-package-name
   ```

2. **仓库里要有真实可用的代码** —— 占位仓库、纯 README 仓库不收
3. **仓库创建满 1 天** —— CI 自动查（不是对质量的评价，是为了挡掉"PR 前几分钟才建的仓库"）
4. **项目处于维护状态** —— 定期扫描会标记已删除/已归档/长期不动的条目
5. **给仓库加 `dsh-plugin` topic**
6. **描述只讲功能，不带营销词**
7. **描述必须准确** —— 它被当作对你插件的声明，并会**对照代码核查**。
   写"46 个工具、六大领域"，就得真有 46 个工具和六个领域；提到某个命令或 API，它就得存在。
   **夸大是唯一会让一个本来合格的插件被打回的原因。**
8. **分类要贴合实际**（同上）

---

## 推荐（不是必须）

- **发布到 npm** —— 预构建安装可以跳过 `allowBuilds` 构建授权这一步
- 不发 npm 也行：把预构建 tarball 挂到 GitHub Release，用可选的 `tarball:` 字段指向它
  - ⚠ 必须是 GitHub Release 上的 `https` `.tgz`
  - ⚠ 用 `latest/download/` 时文件名要**不带版本号**，否则你下次发版这个链接就 404
- 官方 `@deepseek-ai/*` 包声明为 **`peerDependencies`**（不是 `dependencies`）
  - ⚠ peer 范围**必须显式写出预发布分支**，否则会静默排除 harness 的所有预发布版本

---

## 审核看什么

1. 代码是否与条目声明一致（**包括描述里的数字与 API 名**）
2. 分类是否合理
3. 是否是真代码而非占位
4. 是否已被现有条目覆盖（先来者保留位置，但这是平局判定，不是永久席位）

**"上架"不等于安全审计。** 市场只做形式与合理性检查。

---

## 一次 PR 最多 3 条

超过会被 CI 拒绝并要求拆分。

---

## 你可以让自己更好收录的两件事

1. **在仓库里放 `screenshots.json`**（与 `package.json` 同级），列出 1–8 张图片路径：
   ```jsonc
   // <你的仓库>/screenshots.json
   ["assets/screenshot-1.png", "assets/screenshot-2.png"]
   ```
   路径相对该文件；也可以用 `{"screenshots": [...]}` 形式。
   - 图片必须是 **GitHub 托管的 https**（`raw.githubusercontent.com`、`user-images.githubusercontent.com`、
     `camo.githubusercontent.com`、`github.com` 附件）——第三方图床会被拒（隐私原因）
   - 相对路径不能越出插件目录（不能以 `/` 开头、不能含 `..`）
   - 不声明也行：市场会从 README 里自动抽图
2. **发布到 npm**，市场就能按下载量展示与排序。**发不发都不影响收录。**

---

## 主题/皮肤类插件的去处

**仅当**你的插件属于 `theme` 分类，它会自动出现在 dsh-market 的
**「主题与外观」Tab**，用户可以一键安装/切换/卸载。
（液态玻璃是 `ui`，不走这个 Tab。）
