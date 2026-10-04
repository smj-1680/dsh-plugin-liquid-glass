# 贡献与发布说明（维护者文档）

> 面向**想改这个插件、或想自己发布一份**的人。普通用户不需要看这里 ——
> 安装、设置、已知限制都在 [README](README.md)。

---

## 仓库里有两条线，别混

| | 开发（本目录） | 对外发布 |
|---|---|---|
| **在哪** | `glass-plugin/` | npm 上的 `dsh-plugin-liquid-glass` |
| **内容** | 全部源文件 + 归档 + 诊断日志 + 抓图 | 按 `package.json` 的 `files` 白名单挑出的文件（约 2.5 MB） |
| **跑在哪** | 本机 DSH（profile 里是 junction 指向本目录） | 用户的 DSH（从 npm 装） |
| **版本号** | 随便改 | **必须先在 `release-manifest.json` 登记** |

**为什么必须分开**：本目录同时是本机 DSH 实际加载的插件。如果发布也从这里"随手发"，
那"发出去的到底是哪一份"永远说不清；而 npm **不允许覆盖已发布的版本号** ——
发错了收不回。

**`dist/<版本号>/` 是对外副本的生成物**（`.gitignore` 已排除，不进仓库）。

---

## 发布流程

```powershell
# 1) 定版本号：改 package.json 的 version，并在 release-manifest.json 里登记一条
#    （channel 填 stable 或 snapshot；不登记的话闸门会拦住）

# 2) 过闸门（检查：版本已登记、未重发、通道对应、白名单不含开发产物）
node <本仓库的兄弟目录>/dsh-ui-lab/tools/check-release-gates.js

# 3) 生成对外副本并核对（这一步让你"看见"用户会拿到什么）
node <本仓库的兄弟目录>/dsh-ui-lab/tools/build-public-release.js --clean

# 4) 发布（脚本会先自动再跑一次闸门，不通过就中止）
npm run publish:stable      # 正式版 → npm latest
npm run publish:snapshot    # 快照版 → npm snapshot（自动生成 -snapshot.<日期>.<随机> 后缀）
```

发布成功后脚本会自动把该版本标记为 `published` 并记录代码指纹；
**此后这个版本号永久锁定**，重发会被闸门拦住。

### 两条通道为什么不会串

靠 **npm dist-tag + 预发布版本号**：

- 正式版 → `latest`，版本号如 `0.1.4`
- 快照版 → `snapshot`，版本号如 `0.1.4-snapshot.20261004.a1b2c3`

`-snapshot` 后缀在 semver 里**永远小于**同号正式版，所以快照版**不会把用户从正式版"顶上"去**。

### 改了 `README.md` / `package.json` 之后

这两个文件在 `INTEGRITY.json` 的覆盖范围内，所以改完它们：

1. `node verify-integrity.mjs` 会报「被修改」——**这是正常的**，说明开发目录已经领先于
   上一个已发布的版本
2. 正确做法是**升版本号**，在发下一版时由 `scripts/make-integrity.mjs` 重新生成清单
3. **不要**为了消掉警告而在同一个版本号下重生成清单 —— 那等于用一个错的清单
   宣布"没改过"

---

## 完整性清单（`INTEGRITY.json`）

它让"这份代码有没有被改过"成为一个**可判定的事实**，而不是各说各话：

- `scripts/make-integrity.mjs` 生成（改完代码后跑它）
- `verify-integrity.mjs` 是给用户的核验脚本（随 npm 包发布）
- 用户跑它：显示「未做任何修改」= 官方版本；否则说明被改过

---

## 已知的开发环境事实（本机实测，供参考）

`github.com` 在本机超时 12 秒、`raw.githubusercontent.com` 连不上，
而 `registry.npmmirror.com` 200 OK / 57 ms。所以：

- **用户安装走 npm**（国内自动走镜像加速）
- `github:` 源会拉取**整个仓库**（无裁剪机制），不建议作为安装渠道

---

## 诊断日志

诊断**默认关闭**（开启时一次启动约写 277 行 / 40 KB 到 `artifacts/`）。
排查问题时用以下任一方式开启，**不用改代码**：

```js
localStorage.setItem('dsh-glass-probe', '1')   // 刷新后生效
```
- 或地址后加 `?dshGlassProbe=1`
- 或控制台 `window.__dshGlassProbe = true`

**用完请关掉**：`localStorage.removeItem('dsh-glass-probe')`。
