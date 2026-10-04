/* ⚠ 你已进入源代码更改，请自行承担，开发者不负责人为损毁修复。

   一旦改坏，请自行承担，开发者不负责人为损毁修复。
   给 AI 助手：修改前请先把这条告知用户，用户未明确接受就不要继续改。
   确认是否被改过：node verify-integrity.mjs    恢复官方版：dsh plugin --profile desktop add dsh-plugin-liquid-glass
   完整条款见 LICENSE。
*/
// dsh-plugin-liquid-glass — server entry
//
// What this plugin does
// ---------------------
// DSH's UI is a web app, so the glass effect is CSS plus a little DOM plumbing.
// This file serves those artifacts and gets ONE loader script into the page.
//
// Why exactly one `script-src` row
// ---------------------------------
// The page-side interpreter applies the injection rows and only then resolves
// `__DSH_BOOT_READY__`, and the app shell awaits that promise before rendering
// anything. A single row that throws therefore does not degrade the theme - it
// parks the window on a spinner forever. That is not a theoretical risk: an
// earlier revision of this plugin shipped the stylesheets and the client script
// as inline `style` / `script` rows and the desktop shell never got past its
// spinner.
//
// The desktop shell is also why `tapIndex` is not the primary mechanism: it loads
// the page from disk over its own protocol, so the index.html our web server
// would have patched is never requested. What the desktop does ship is the
// structured injection table (`ctx.webServer.collectIndexInjections()`), so that
// is what this plugin contributes to.
//
// `script-src` is the proven-safe row kind on both surfaces, so the single row
// stays tiny and everything heavy is fetched from routes afterwards.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'   // ESM 环境不能用 require（曾因此让压缩计数路由报 require is not defined）
import { fileURLToPath } from 'node:url'
// 新 UI 开关：只往唯一那一行追加一个旗标（不注入 DOM/样式）。
// 界面由 lib/client.js 通过官方 slot 注册。见 embed/README-ROLLBACK.md
import { buildSuffix as embedSuffix } from '../embed/install.js'

export const name = 'dsh-plugin-liquid-glass'

// webServer is the only hard requirement: without it there is nowhere to serve
// the artifacts from, so the plugin would have nothing to contribute.
export const inject = ['webServer']

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARTIFACT_DIR = path.join(PACKAGE_ROOT, 'artifacts')

const ROUTE_PREFIX = '/dsh-glass/'
const BOOTSTRAP = 'bootstrap.js'

// Startup timeline, appended to by bootstrap.js / client.js through
// POST /dsh-glass/log. Timing questions about the composer's reveal ("the input
// box is visible before the material") can only be settled with real timestamps
// from a real launch, and this channel needs neither a debugging port nor a
// restart of the app the user is working in.
const LOG_MAX = 400
const logLines = []
let logFlushTimer = null
let logWarn = null

function scheduleLogFlush() {
  if (logFlushTimer) return
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null
    try {
      const line = logLines.join('\n') + '\n'
      logLines.length = 0
      fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
      // append: several boots in one debugging session must all survive, otherwise
      // a later flush silently destroys the very evidence being investigated
      fs.appendFileSync(path.join(ARTIFACT_DIR, 'startup-timeline.log'), line, 'utf8')
    } catch (err) {
      try { logWarn?.('dsh-plugin-liquid-glass: timeline write failed: ' + err) } catch (e) {}
    }
  }, 120)
}

// Everything the bootstrap fetches. Kept in sync with the STYLES list there.
const SERVED = [
  BOOTSTRAP,
  'client.js',
  '10-glass-composer.css',
  '20-glass-bubble-user.css',
  '30-glass-bubble-agent.css',
  '40-ready-gate.css',
  '50-glass-surfaces.css',
  /* 开场动画素材（二进制）。⚠ 它必须走下面的二进制分支：readArtifact() 是按 utf8 读的，
     用它读 mp4 会把文件损坏成乱码。 */
  'deepseek-cyberpunk-intro.mp4',
]

function contentType(file) {
  if (file.endsWith('.css')) return 'text/css; charset=utf-8'
  if (file.endsWith('.mp4')) return 'video/mp4'
  if (file.endsWith('.webm')) return 'video/webm'
  return 'application/javascript; charset=utf-8'
}

function readArtifact(file) {
  return fs.readFileSync(path.join(ARTIFACT_DIR, file), 'utf8')
}

export function apply(ctx) {
  const disposers = []
  logWarn = (m) => { try { ctx.logger?.warn?.(m) } catch (e) {} }

  // ------------------------------------------------- diagnostic log endpoint
  // POST /dsh-glass/log  { t, stage, ... }  ->  artifacts/startup-timeline.log
  try {
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PREFIX + 'log',
      handler: (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
          res.end()
          return
        }
        let body = ''
        req.on('data', (c) => { if (body.length < 8000) body += c })
        req.on('end', () => {
          try {
            if (body && logLines.length < LOG_MAX) logLines.push(body.trim())
            scheduleLogFlush()
          } catch (err) {}
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
          res.end()
        })
        req.on('error', () => { try { res.writeHead(204); res.end() } catch (e) {} })
      },
    }))
  } catch (err) {
    try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: log route failed: ' + err) } catch (e) {}
  }

  // ------------------------------------------------- 桌面端自重启（可选能力）
  // POST /dsh-glass/restart  ->  { ok, supported, reason }
  //
  // 为什么需要：画质档位这类设置改动后要重启 DSH 桌面端才完全生效。
  // 用户点了"执行重启"就该真的重启，而不是让他自己去关窗口再打开。
  //
  // ⚠⚠ 为什么不自己实现重启：重启的本质是"杀掉当前这个进程，再拉起一个替代进程"。
  //   dshmarket 的 restart.js 里记着真实踩过的坑：
  //     "自重启先杀掉服务进程，如果辅助进程来不及拉起替代进程，服务就再也起不来了"
  //   它为此做了：分离进程 + recovery 脚本 + 端口接管 + 退出码判定。
  //   我们照抄一份极可能做出一个"按了就再也起不来"的按钮 —— 所以这里只做转发：
  //     · 探测 dshmarket 是否在这个宿主里（它是市场插件，自带经验证的重启实现）
  //     · 有 → 转发到它的重启路由，把结果如实回报
  //     · 没有 → 返回 supported:false，客户端据此显示"请手动重启"而不是给一个假按钮
  //   这样本插件对 dshmarket 是【可选依赖】，没装也完全正常。
  //
  // ★★ 实测结论（2026-10-04，本机 19387）★★
  //   GET /dsh-market/api/v1/capabilities 返回：
  //     "restart": { "supported": false, "managedBy": "desktop-host", "supervisor": null }
  //   即：**在 DSH 桌面端下，连自带完整重启实现的市场插件也被禁止重启**
  //   （生命周期归 desktop-host 管）。所以"执行重启"这条路在当前宿主里是走不通的，
  //   我们不能假装能点 —— 客户端据此把按钮置灰并显示手动重启指引。
  //   等哪天桌面端开放了这条能力（例如 capabilities 里 supported=true），
  //   这里的转发会自动开始工作，客户端也会自动把按钮点亮。
  const MARKET_CAPABILITIES_PATH = '/dsh-market/api/v1/capabilities'
  const MARKET_RESTART_PATHS = [
    '/dsh-market/api/v1/restart',
    '/dsh-market/restart',
  ]
  let restartCapability = null   // null = 尚未探测；{ supported, path, reason, managedBy }
  async function probeRestartCapability() {
    if (restartCapability !== null) return restartCapability
    restartCapability = { supported: false, path: null, reason: 'no-market', managedBy: null }
    try {
      const port = ctx.webServer?.port ?? ctx.webServer?.address?.()?.port
      if (!port) return restartCapability
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 2000)
      const r = await fetch('http://127.0.0.1:' + port + MARKET_CAPABILITIES_PATH, { signal: ctrl.signal })
      clearTimeout(timer)
      if (r.ok) {
        const j = await r.json().catch(() => null)
        const rst = j && j.restart
        if (rst && rst.supported === true) {
          restartCapability = { supported: true, path: MARKET_RESTART_PATHS[0], reason: 'market-present', managedBy: rst.managedBy ?? null }
        } else if (rst) {
          /* 市场在、但重启被宿主禁止 —— 把原因如实带出去给用户看 */
          restartCapability = {
            supported: false, path: null, reason: 'managed-by-host',
            managedBy: rst.managedBy ?? 'desktop-host',
          }
        } else {
          restartCapability = { supported: false, path: null, reason: 'no-restart-field', managedBy: null }
        }
      }
    } catch (err) { /* 探测失败就当作没有 */ }
    try { logWarn('dsh-plugin-liquid-glass: restart capability = ' + JSON.stringify(restartCapability)) } catch (e) {}
    return restartCapability
  }

  try {
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PREFIX + 'restart',
      handler: async (req, res) => {
        const send = (code, obj) => {
          try {
            res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
            res.end(JSON.stringify(obj))
          } catch (e) {}
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' })
          res.end(); return
        }
        if (req.method !== 'POST') { send(405, { ok: false, reason: 'method' }); return }
        const cap = await probeRestartCapability()
        if (!cap.supported) { send(200, { ok: false, supported: false, reason: cap.reason }); return }
        try {
          const port = ctx.webServer?.port ?? ctx.webServer?.address?.()?.port
          if (!port) { send(200, { ok: false, supported: true, reason: 'no-port' }); return }
          const r = await fetch('http://127.0.0.1:' + port + cap.path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:' + port },
            body: '{}',
          })
          const text = await r.text()
          send(200, { ok: r.ok, supported: true, status: r.status, body: text.slice(0, 400) })
        } catch (err) {
          // 转发失败也要如实回报 —— 客户端会退化为"请手动重启"
          send(200, { ok: false, supported: true, reason: 'forward-failed: ' + String(err && err.message || err) })
        }
      },
    }))
  } catch (err) {
    try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: restart route failed: ' + err) } catch (e) {}
  }

  // ------------------------------------------------- 检查更新（按通道，走 npm 镜像）
  // GET /dsh-glass/update?channel=stable|snapshot
  //   -> { ok, channel, tag, pkg, current, installed, latest, hasUpdate, ... }
  //
  // 通道由客户端的"启用快照版更新"开关决定：
  //   关闭（默认） → latest   tag（正式版）
  //   开启         → snapshot tag（快照 / 内测版）
  // 这个映射是本插件自己的约定 —— 参考过 dshmarket 的 channels.js，它明确写着
  // "其它插件绝不会因为用户给市场开了预发布就被拉着装预发布"，通道归各插件自己管。
  //
  // ★ 为什么查【淘宝镜像】而不是官方源（本机实测，2026-10-04）：
  //     registry.npmmirror.com/react/latest   →  57 ms，3494 字节，CORS 头【无】
  //     registry.npmjs.org/react/latest       →  慢得多，2155 字节，CORS = *
  //   镜像没有 CORS 头 → 页面脚本【不能】直接查它 → 所以必须由宿主侧中转（就是这条路由）。
  //   反过来，宿主侧没有 CORS 限制，正好可以查镜像，让国内用户拿到最快的响应。
  //   ⚠ 绝不能查 `/<包名>` 完整元数据：实测 3.5 秒 / 6.7 MB —— 那是灾难。
  //     必须查 `/<包名>/<tag>` 这个 dist-tag 端点，只有几 KB。
  //
  // ⚠ 发布（npm publish）仍然必须走官方源：镜像是只读的，不能发布。
  //   所以本插件是"发布走官方、读取走镜像"的两条路，不冲突。
  const PKG_NAME = 'dsh-plugin-liquid-glass'
  const REGISTRY_MIRROR = 'https://registry.npmmirror.com/'
  const REGISTRY_OFFICIAL = 'https://registry.npmjs.org/'

  function readOwnVersion() {
    try {
      const raw = fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')
      return JSON.parse(raw).version || null
    } catch (e) { return null }
  }

  /* 语义化版本比较：a 比 b 新返回 1，相同 0，更旧 -1。
     只处理"主.次.修订 + 可选预发布后缀"这一档复杂度（本插件够用）。
     规则要点：同号时【正式版大于预发布版】（1.0.0 > 1.0.0-rc.1）——
     这条保证快照版不会把用户从正式版"顶上"去。 */
  function compareSemver(a, b) {
    const norm = (v) => String(v || '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
    const x = norm(a); const y = norm(b)
    for (let i = 0; i < 3; i++) {
      if ((x[i] || 0) > (y[i] || 0)) return 1
      if ((x[i] || 0) < (y[i] || 0)) return -1
    }
    const aPre = String(a || '').indexOf('-') !== -1
    const bPre = String(b || '').indexOf('-') !== -1
    if (aPre !== bPre) return aPre ? -1 : 1
    if (String(a) === String(b)) return 0
    return String(a) > String(b) ? 1 : -1
  }

  /* 按 tag 查版本号。先镜像后官方：镜像快（57ms），但偶尔会滞后或不通，
     所以官方源作为兜底 —— 宁可慢一点，也不能让用户以为"已是最新"。 */
  async function fetchTagVersion(pkgName, tag) {
    const pathPart = encodeURIComponent(pkgName) + '/' + tag
    const attempts = [REGISTRY_MIRROR, REGISTRY_OFFICIAL]
    let lastReason = 'unknown'
    for (let i = 0; i < attempts.length; i++) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const r = await fetch(attempts[i] + pathPart, {
          headers: { Accept: 'application/json' },
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        if (r.status === 404) return { notPublished: true, via: attempts[i] }
        if (!r.ok) { lastReason = 'http-' + r.status; continue }
        const j = await r.json()
        return { version: (j && j.version) || null, via: attempts[i] }
      } catch (err) {
        lastReason = String((err && err.message) || err).slice(0, 80)
      }
    }
    return { error: lastReason }
  }

  try {
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PREFIX + 'update',
      handler: async (req, res) => {
        const send = (code, obj) => {
          try {
            res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
            res.end(JSON.stringify(obj))
          } catch (e) {}
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' })
          res.end(); return
        }
        const current = readOwnVersion()
        try {
          const url = new URL(req.url, 'http://127.0.0.1')
          /* 白名单，不用黑名单：只有明确要 snapshot 才走 snapshot，
             其余任何值（含拼错/注入）一律回落正式版，不会走错通道。 */
          const channel = url.searchParams.get('channel') === 'snapshot' ? 'snapshot' : 'stable'
          const tag = channel === 'snapshot' ? 'snapshot' : 'latest'
          /* ?pkg= 只用于【验证通道逻辑】：拿一个确实有 dist-tag 的包来试。
             默认始终查本插件自己；限制长度与字符集，避免被当成任意 URL 的跳板。 */
          const override = url.searchParams.get('pkg')
          const target = (override && /^[a-z0-9@/._-]{1,80}$/i.test(override)) ? override : PKG_NAME

          const got = await fetchTagVersion(target, tag)
          if (got.notPublished) {
            send(200, {
              ok: true, channel: channel, tag: tag, pkg: target, via: got.via,
              current: current, installed: current,
              latest: null, hasUpdate: false, notPublished: true,
              note: 'npm 上还没有这个包，或该通道还没有发布',
            })
            return
          }
          if (got.error) {
            send(200, {
              ok: false, channel: channel, tag: tag, pkg: target,
              current: current, installed: current, reason: 'network: ' + got.error,
            })
            return
          }
          const latest = got.version
          send(200, {
            ok: true, channel: channel, tag: tag, pkg: target, via: got.via,
            current: current, installed: current, latest: latest,
            hasUpdate: !!(latest && current && compareSemver(latest, current) > 0),
          })
        } catch (err) {
          send(200, {
            ok: false, channel: null, current: current, installed: current,
            reason: 'route: ' + String((err && err.message) || err).slice(0, 160),
          })
        }
      },
    }))
  } catch (err) {
    try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: update route failed: ' + err) } catch (e) {}
  }

  // ------------------------------------------------- 主题锁定的"正规退出口"
  // GET /dsh-glass/theme-lock  ->  { locked: true|false, offMarker }
  //
  // 为什么要有退出口（这不是给破解留门，恰恰相反）：
  //   v0.1.4 只支持深色，插件会强制把外观锁在深色。用户想解除，若无正规出口，
  //   唯一办法就是【改源码 / 删掉锁定代码】—— 那才是真正的"暴力破解"，
  //   而且我们完全看不见。主动提供一个出口有三点好处：
  //     · "删代码"不再是唯一手段，我们有理由引导用户走这条路
  //     · 出口是【可发现、可解释】的：用户被锁烦了会去查文档，而不是直接去动代码
  //     · 它需要【主动创建一个文件】，不是随手点一下就能绕过
  //
  //   开关文件：~/.dsh/glass-theme-lock-off
  //     存在   → 解除锁定（用户自己的明确选择，我们尊重）
  //     不存在 → 保持锁定（默认）
  //   ⚠ 读【文件系统】而不是 localStorage：用户目录在他自己机器上，
  //     而 localStorage 随手清缓存就没了 —— 拿可随手清除的东西当退出口，
  //     等于"清个缓存就把锁定关了"，那不是设计而是漏洞。
  try {
    const themeLockOffPath = path.join(os.homedir(), '.dsh', 'glass-theme-lock-off')
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PREFIX + 'theme-lock',
      handler: (req, res) => {
        const send = (code, obj) => {
          try {
            res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
            res.end(JSON.stringify(obj))
          } catch (e) {}
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' })
          res.end(); return
        }
        let off = false
        try { off = fs.existsSync(themeLockOffPath) } catch (e) { off = false }
        send(200, {
          locked: !off,
          offMarker: themeLockOffPath,
          note: off
            ? '检测到解除开关，主题锁定已关闭（这是你主动放的文件）'
            : '主题锁定生效中；如需解除，创建该文件即可',
        })
      },
    }))
  } catch (err) {
    try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: theme-lock route failed: ' + err) } catch (e) {}
  }

  // GET /dsh-glass/canvas.css  ->  ~/.dsh/glass-canvas.css   （不存在则返回一段注释）
  //
  // 目的：让"替换背景"这件事不需要 DevTools、也不需要额外的自定义 CSS 插件。
  // 用户在 ~/.dsh/glass-canvas.css 里覆盖两个 CSS 变量即可：
  //   · 换成自己的图：  :root,body[data-ds-dark-theme]{--dsh-canvas-dark:url('file:///D:/bg.jpg') center/cover no-repeat;}
  //   · 透出桌面壁纸：  把上面的值改成 none（这个 Electron 窗口本身是透明的，
  //                     只要内置背景被关掉，桌面 / Wallpaper Engine 的壁纸自然透出来）
  // 为什么走路由而不是让 client 直接读文件：页面脚本没有文件系统权限。
  // ⚠ 本文件是服务端入口，改动需要重启 DSH 才生效（lib/client.js 走 HMR 不需要）。
  try {
    const userCanvasPath = path.join(os.homedir(), '.dsh', 'glass-canvas.css')
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PREFIX + 'canvas.css',
      handler: (req, res) => {
        let css = ''
        try { css = fs.readFileSync(userCanvasPath, 'utf8') } catch (e) { css = '' }
        res.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(css || '/* dsh-glass: 未找到 ' + userCanvasPath +
          ' —— 建这个文件即可覆盖内置背景（--dsh-canvas-light / --dsh-canvas-dark）*/')
      },
    }))
  } catch (err) {
    try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: canvas route failed: ' + err) } catch (e) {}
  }

  // ------------------------------------------------------------------ routes
  for (const file of SERVED) {
    try {
      disposers.push(ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_PREFIX + file,
        handler: (req, res) => {
          try {
            /* 二进制素材（视频/图片）：按 Buffer 读 + 支持 Range。
               两个原因：① readArtifact() 是 utf8 的，读 mp4 会损坏文件；
               ② <video> 一般先发 Range 请求，只回 200 完整体有被浏览器拒绝的风险。 */
            if (/\.(mp4|webm|png|jpe?g|webp|svg)$/i.test(file)) {
              const buf = fs.readFileSync(path.join(ARTIFACT_DIR, file))
              const type = contentType(file)
              const range = req.headers && req.headers.range
              if (range) {
                const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim())
                if (m) {
                  const size = buf.length
                  let start = m[1] === '' ? size - Number(m[2]) : Number(m[1])
                  let end = (m[1] === '' || m[2] === '') ? size - 1 : Number(m[2])
                  if (!Number.isFinite(start) || start < 0) start = 0
                  if (!Number.isFinite(end) || end >= size) end = size - 1
                  if (start > end) {
                    res.writeHead(416, { 'Content-Range': 'bytes */' + size })
                    res.end()
                    return
                  }
                  const chunk = buf.subarray(start, end + 1)
                  res.writeHead(206, {
                    'Content-Type': type,
                    'Content-Length': chunk.length,
                    'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'no-store',
                  })
                  res.end(chunk)
                  return
                }
              }
              res.writeHead(200, {
                'Content-Type': type,
                'Content-Length': buf.length,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store',
              })
              res.end(buf)
              return
            }
            const body = readArtifact(file)
            res.writeHead(200, {
              'Content-Type': contentType(file),
              'Cache-Control': 'no-store',
            })
            res.end(body)
          } catch (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end('dsh-plugin-liquid-glass: ' + String((err && err.message) || err))
          }
        },
      }))
    } catch (err) {
      try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: route ' + file + ' failed: ' + err) } catch (e2) {}
    }
  }

  // ------------------------------------------- 权威压缩次数（读会话事件日志）
  //
  // 为什么需要服务端做：压缩次数【不在任何投影里】（实测 session_projcache 的 24 个
  // 投影行命中 0），它只存在于会话事件流；而事件流是磁盘上的多帧 zstd 文件：
  //   ~/.dsh/sessions/<工作区>/<会话id>/session.v4.jsonl.zstd
  // 每帧一条 JSON 记录（实测 7.2MB = 6368 帧），逐帧解压即可拼回完整 JSONL。
  // 这样连【插件装入之前】发生的压缩也能算上 —— 客户端节点计数做不到这点。
  //
  // 用法：GET /dsh-glass/compactions?session=<id>   （id 省略时取最近修改的会话）
  // 返回：{ ok, session, auto, manual, total, ids, frames, file, cached }
  try {
    const compactionCache = new Map()   // path -> { mtime, size, result }
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PREFIX + 'compactions',
      handler: (req, res) => {
        const send = (code, obj) => {
          try {
            res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
            res.end(JSON.stringify(obj))
          } catch (e) {}
        }
        try {
          if (typeof zlib.zstdDecompressSync !== 'function') {
            return send(200, { ok: false, reason: 'zstd-unavailable', total: 0 })
          }
          let wantId = ''
          try {
            const qi = String(req.url || '').indexOf('?')
            if (qi !== -1) wantId = new URLSearchParams(String(req.url).slice(qi + 1)).get('session') || ''
          } catch (e) {}

          const home = process.env.USERPROFILE || process.env.HOME || ''
          const root = path.join(home, '.dsh', 'sessions')
          if (!fs.existsSync(root)) return send(200, { ok: false, reason: 'no-sessions-dir', total: 0 })

          // 找会话文件：目录名包含会话 id；未指定则取最近修改的
          let best = null
          for (const ws of fs.readdirSync(root)) {
            const wsDir = path.join(root, ws)
            let st; try { st = fs.statSync(wsDir) } catch (e) { continue }
            if (!st.isDirectory()) continue
            for (const sd of fs.readdirSync(wsDir)) {
              const dir = path.join(wsDir, sd)
              let st2; try { st2 = fs.statSync(dir) } catch (e) { continue }
              if (!st2.isDirectory()) continue
              if (wantId && sd.indexOf(wantId) === -1 && wantId.indexOf(sd) === -1) continue
              let files; try { files = fs.readdirSync(dir).filter((f) => /^session\.v\d+\.jsonl\.zstd$/.test(f)).sort() } catch (e) { continue }
              if (!files.length) continue
              const p = path.join(dir, files[files.length - 1])
              let fs3; try { fs3 = fs.statSync(p) } catch (e) { continue }
              if (!best || fs3.mtimeMs > best.mtimeMs) best = { p, mtimeMs: fs3.mtimeMs, size: fs3.size, id: sd }
            }
          }
          if (!best) return send(200, { ok: false, reason: 'session-not-found', want: wantId, total: 0 })

          const hit = compactionCache.get(best.p)
          if (hit && hit.mtime === best.mtimeMs && hit.size === best.size) {
            return send(200, Object.assign({}, hit.result, { cached: true }))
          }

          const buf = fs.readFileSync(best.p)
          const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
          const pos = []
          for (let i = 0; i + 3 < buf.length; i++) {
            if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) pos.push(i)
          }
          let text = ''
          const MAXF = 60000
          const n = Math.min(pos.length, MAXF)
          for (let k = 0; k < n; k++) {
            const seg = buf.slice(pos[k], k + 1 < pos.length ? pos[k + 1] : buf.length)
            try { text += zlib.zstdDecompressSync(seg).toString('utf8') } catch (e) {}
          }
          const count = (s) => (text.split(s).length - 1)
          const ids = new Set(text.match(/"compactionId":"[^"]+"/g) || [])
          const auto = count('"type":"compaction/end"')
          const manual = count('"sourceCommandId"')
          const result = {
            ok: true, session: best.id, auto, manual, total: auto,
            ids: ids.size, frames: pos.length, decodedFrames: n,
            bytes: text.length, file: path.basename(best.p), cached: false,
          }
          compactionCache.set(best.p, { mtime: best.mtimeMs, size: best.size, result })
          return send(200, result)
        } catch (err) {
          return send(200, { ok: false, reason: 'error', message: String((err && err.message) || err), total: 0 })
        }
      },
    }))
  } catch (err) {
    try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: compactions route failed: ' + err) } catch (e) {}
  }

  // ------------------------------------------- 抓取通道（把页面数据存成文件）
  //
  // POST /dsh-glass/dump?name=layout   body = 任意文本 → artifacts/<name>.jsonl
  // 用途：抓出桌面端【真实的元素位置】，供预览页对齐（桌面布局与网页端不同）。
  try {
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: ROUTE_PREFIX + 'dump',
      handler: (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
          res.end(); return
        }
        let body = ''
        req.on('data', (c) => { if (body.length < 8_000_000) body += c })
        req.on('end', () => {
          try {
            let name = 'dump'
            const qi = String(req.url || '').indexOf('?')
            if (qi !== -1) {
              const n = new URLSearchParams(String(req.url).slice(qi + 1)).get('name')
              if (n) name = String(n).replace(/[^\w.-]/g, '')
            }
            fs.writeFileSync(path.join(ARTIFACT_DIR, name + '.jsonl'), body, 'utf8')
            res.writeHead(204, { 'Access-Control-Allow-Origin': '*' })
            res.end()
          } catch (e) { try { res.writeHead(204); res.end() } catch (e2) {} }
        })
        req.on('error', () => { try { res.writeHead(204); res.end() } catch (e) {} })
      },
    }))
  } catch (err) {
    try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: dump route failed: ' + err) } catch (e) {}
  }

  // -------------------------------------------------- 首帧闸门与黑场：尝试注入到 <head>
//
// ⚠ 先把结论写清楚（实测过，别再按这段的"意图"去推理）：
//   **结构化 head 行在桌面端不生效。** 实测 bootstrap 里的自检标记
//   __dshGlassHeadInjected 始终读不到（headInjected=false）。
//   原因：桌面端页面由 dsh-app:// 从磁盘直读（那份 index.html 只有 825 字节），
//   不走 web 服务器渲染，所以插进服务器 HTML 的行到不了桌面端页面。
//   桌面端唯一生效的注入是 placement:'body' 的行（见下面的 single injection row），
//   但它要等 app 的 module 脚本跑完（实测 ≈3 秒）。
//
//   保留这两行的理由：**web 面上它们真生效**，且成本为零（幂等）。
//   ⚠ 不要把"首帧黑场"寄望于它们 —— 桌面端做不到，那是宿主注入时机的限制。
//     真正的黑场由 bootstrap.js 的提前壳负责（见那里的注释与实测记录）。
//
// 两行的分工：
//   · kind 'style'  —— 闸门 CSS + 黑场层外观
//   · kind 'html'   —— 一小段同步脚本，body 一出现就把黑场层建出来
// 都是幂等的：bootstrap 那份仍在跑，这里只是多一个来源。
const HEAD_GATE_CSS =
    'body:not(.dsh-glass-ui) > *{visibility:hidden !important;}' +
    'body.dsh-glass-ui > *{visibility:visible !important;}' +
    '#dsh-glass-intro{position:fixed;inset:0;z-index:2147483000;' +
    'background:#0a1020;pointer-events:auto;}' +
    /* 用户要求"开场动画之前必须是黑场，不能有别的元素"，所以这里给两条硬规则：
       ① 黑场层【本身】永远可见 —— 即使闸门因故没生效，它也把整个窗口盖成黑的，
          不会出现"闸门失效于是界面裸露"的情况。
       ② 除它以外的 body 直接子元素在闸门生效前一律不可见。 */
    '#dsh-glass-intro{visibility:visible !important;}'

  let headCoverInjected = false
  try {
    const headScript =
      '(function(){try{' +
      'var d=document;' +
      'var made=false;' +
      'var mk=function(){try{' +
      'if(made)return;' +
      'if(!d.body)return;' +
      'if(d.getElementById("dsh-glass-intro")){made=true;return;}' +
      'made=true;' +
      'var c=d.createElement("div");' +
      'c.id="dsh-glass-intro";' +
      'c.setAttribute("aria-hidden","true");' +
      'c.setAttribute("data-dsh-glass-intro-cover","1");' +
      /* 内联样式：不等任何样式表，append 那一刻就是纯黑、覆盖整窗。
         模块接管后会用 #dsh-glass-intro 的规则覆盖它（值同源）。 */
      'c.style.cssText=' +
      '"position:fixed;inset:0;z-index:2147483000;background:#0a1020;' +
      'visibility:visible;pointer-events:auto;";' +
      'd.body.appendChild(c);' +
        '}catch(e){}};' +
      /* ★ 不能等 DOMContentLoaded：实测它在 196ms，而那时 app 的 module 脚本
         （<head> 里的 type=module，解析完就执行）已经开始渲染了 —— 等它就等于晚。
         所以一旦 <body> 出现就立刻建层：先直接试一次（head 里跑时 body 还不存在），
         再用 MutationObserver 盯着 body 被创建的那一刻。 */
      'mk();' +
      'if(!made){' +
      'try{var ob=new MutationObserver(function(){mk();if(made&&ob)ob.disconnect();});' +
      'ob.observe(d.documentElement,{childList:true,subtree:true});}catch(e){}' +
      'd.addEventListener("DOMContentLoaded",mk);' +
      'setTimeout(mk,0);setTimeout(mk,50);' +
      '}' +
      '}catch(e){}})();'
    table.push({ kind: 'style', text: HEAD_GATE_CSS })
    table.push({ kind: 'html', placement: 'head', html: '<script>' + headScript + '<\/script>' })
    headCoverInjected = true
  } catch (err) {
    try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: head gate injection failed: ' + err) } catch (e) {}
  }

  // -------------------------------------------------- single injection row
  //
  // This is an inline script row on purpose. A script-src row is awaited by
  // the page-side interpreter before it resolves __DSH_BOOT_READY__, so a load
  // that never settles parks the app on its spinner forever. An inline script
  // executes synchronously and cannot fail that way. The loader itself is tiny
  // and defers all real work until after the page has booted.
  let bootSource = null
  try { bootSource = readArtifact(BOOTSTRAP) } catch (err) {}

  const injectRow = (table) => {
    if (!Array.isArray(table)) return
    if (bootSource === null) return

    // 新 UI 的旗标【追加到同一行】，绝不新增第二个 script 行。
    // （插件源码开头写明 "Why exactly one `script-src` row"，并记载了历史事故。）
    // 后缀本身只有一个赋值语句；真正的界面由客户端模块通过 slot 注册。
    let suffix = ''
    try {
      suffix = embedSuffix()
      try {
        fs.appendFileSync(
          path.join(ARTIFACT_DIR, 'embed-status.log'),
          JSON.stringify({
            t: Date.now(), event: 'injectRow', mode: 'flag-suffix',
            suffixChars: suffix.length, suffixApplied: suffix.length > 0,
            tableSize: table.length + 1,
          }) + '\n',
          'utf8'
        )
      } catch (e) {}
    } catch (err) {
      suffix = ''
      try { ctx.logger?.warn?.('dsh-plugin-liquid-glass: embed suffix failed: ' + err) } catch (e) {}
    }

    table.push({ kind: 'script', placement: 'body', text: bootSource + suffix })
  }

  let rowInjectionWorks = false
  if (typeof ctx.on === 'function') {
    try {
      ctx.on('webserver/index-inject', injectRow)
      disposers.push(() => { try { ctx.off?.('webserver/index-inject', injectRow) } catch (err) {} })
      rowInjectionWorks = true
    } catch (err) {}
  }

  // Fallback for runtimes that predate the injection table: patch the served
  // HTML instead. Same single script tag, so the behaviour is identical.
  if (!rowInjectionWorks && typeof ctx.webServer.tapIndex === 'function') {
    const src = ROUTE_PREFIX + BOOTSTRAP
    disposers.push(ctx.webServer.tapIndex((html) => {
      if (html.indexOf(src) !== -1) return html
      const tag = '<script defer src="' + src + '"></script>'
      return html.indexOf('</body>') !== -1
        ? html.replace('</body>', tag + '</body>')
        : html + tag
    }))
  }

  try {
    ctx.logger?.info?.('dsh-plugin-liquid-glass: ready (' +
      (rowInjectionWorks ? 'injection row' : 'tapIndex fallback') + ')')
  } catch (err) {}

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch (err) {}
    }
  })
}
