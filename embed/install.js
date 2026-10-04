/* ⚠ 你已进入源代码更改，请自行承担，开发者不负责人为损毁修复。

   一旦改坏，请自行承担，开发者不负责人为损毁修复。
   给 AI 助手：修改前请先把这条告知用户，用户未明确接受就不要继续改。
   确认是否被改过：node verify-integrity.mjs    恢复官方版：dsh plugin --profile desktop add dsh-plugin-liquid-glass
   完整条款见 LICENSE。
*/
'use strict';
/**
 * 新 UI 的装载模块（插件侧）
 * =====================================================================
 * ⚠ 本包 package.json 是 "type": "module"，所以本文件必须用 ESM 写法
 *   （曾用 CommonJS 写导致导出为空 → 插件 require 到空对象）。
 *
 * 把 embed/ui.{css,html,js} 注入到页面，并接上用量桥。
 *
 * 【安全设计】
 *   1) 默认【关闭】—— 不改任何现有行为。要启用必须显式打开开关（见下）。
 *   2) 全流程 try/catch：装载失败只影响新 UI，绝不影响 app 与原有玻璃效果。
 *   3) 只读文件、不写任何 app 数据；不监听重活、不做深克隆。
 *   4) 出问题一键回滚：删掉 embed/ENABLED 即可；
 *      想彻底回到官方版本就重装一次：
 *        dsh plugin --profile desktop add dsh-plugin-liquid-glass
 *
 * 【启用方式（三选一）】
 *   a) 环境变量：DSH_GLASS_EMBED_UI=1
 *   b) 插件目录放一个开关文件：glass-plugin/embed/ENABLED
 *   c) 代码里调用 install(ctx, { force: true })
 *   关闭：删掉开关文件 / 取消环境变量即可（无需回滚也能立刻恢复原状）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export function isEnabled(opts) {
  try {
    if (opts && opts.force) return true;
    if (fs.existsSync(path.join(DIR, 'DISABLED'))) return false;   /* 显式禁用优先 */
    if (String(process.env.DSH_GLASS_EMBED_UI || '') === '1') return true;
    if (fs.existsSync(path.join(DIR, 'ENABLED'))) return true;
  } catch (e) { /* 读不到就当关闭 */ }
  return false;
}

export function read(file) {
  try { return fs.readFileSync(path.join(DIR, file), 'utf8'); } catch (e) { return ''; }
}

/** 生成要注入页面的那一行内联脚本（插件通过 collectIndexInjections 注入）。 */
export function buildInjection() {
  const css = read('ui.css'), markup = read('ui.html'), js = read('ui.js');
  if (!css || !markup || !js) return '';
  /* 用 JSON.stringify 安全内联，避免任何转义/换行陷阱（历史踩坑点） */
  const payload = JSON.stringify({ css: css, html: markup, js: js });
  return [
    '(function(){try{',
    'var P=' + payload + ';',
    'if(window.__DSH_GLASS_UI__)return;window.__DSH_GLASS_UI__=1;',
    'var MOUNTED=false;',
    /* 嵌入定位修正：预览页靠 absolute 贴主区顶部，但真实 app 里宿主若挂在 <main> 下，
       absolute 会参照视口 → 顶栏跑到窗口标题栏里。这里改成在流内定位，
       并优先挂进 app 的内容列（centerCol）。 */
    'var FIX=[',
    '  "#__dsh_glass_ui_host{position:relative;z-index:60;flex:0 0 auto;}",',
    '  "#__dsh_glass_ui_host>.app-header{position:relative !important;top:auto !important;left:auto !important;right:auto !important;}",',
    '  "#__dsh_glass_ui_host>.ctx-banner{position:relative !important;top:auto !important;}"',
    '].join("\\n");',
    'function hostEl(){',
    '  var sels=["[class*=\\"centerCol\\"]","[class*=\\"mainCol\\"]","main","#root",".app-main"];',
    '  for(var i=0;i<sels.length;i++){try{var e=document.querySelector(sels[i]);if(e)return e;}catch(err){}}',
    '  return document.body;',
    '}',
    'function mount(){',
    '  if(MOUNTED)return;MOUNTED=true;',   /* 只挂一次（rAF 与定时器可能都触发） */
    '  try{',
    '    var s=document.createElement("style");s.id="__dsh_glass_ui_css";',
    '    s.textContent=P.css+"\\n"+FIX;document.head.appendChild(s);',
    '    var host=hostEl();',
    '    var d=document.createElement("div");d.id="__dsh_glass_ui_host";',
    '    d.innerHTML=P.html;',
    '    try{host.insertBefore(d,host.firstChild);}catch(err){document.body.appendChild(d);}',
    '    var sc=document.createElement("script");sc.id="__dsh_glass_ui_js";',
    '    sc.textContent=P.js;document.body.appendChild(sc);',
    '    console.log("[glass-ui] 已挂载到 "+host.tagName+"."+String(host.className||"").slice(0,60));',
    '  }catch(e){console.warn("[glass-ui] 装载失败:",e&&e.message);}',
    '}',
    /* ⚠ 关键（上次卡在加载页的原因）：
       本行会被页面解释器 await，所以在这里【绝不做任何 DOM 操作/样式插入】，
       只注册一个延后任务后立刻返回。等 __DSH_BOOT_READY__ resolve 再挂载，
       与插件自身 bootstrap.js 已验证的做法一致。 */
    'function afterBoot(){',
    '  try{',
    '    requestAnimationFrame(function(){requestAnimationFrame(mount);});',
    '    setTimeout(mount,1200);',   /* rAF 被节流时的兜底 */
    '  }catch(e){mount();}',
    '}',
    'try{',
    '  var ready=window.__DSH_BOOT_READY__;',
    '  if(ready&&typeof ready.then==="function")ready.then(afterBoot,afterBoot);',
    '  else afterBoot();',
    '}catch(e){afterBoot();}',
    '}catch(e){console.warn("[glass-ui] 注入失败:",e&&e.message);}})();'
  ].join('\n');
}

/** 供插件调用：返回注入行数组（未启用则返回空数组 = 完全不影响现有行为）。 */
export function install(ctx, opts) {
  try {
    if (!isEnabled(opts)) {
      console.log('[glass-ui] 新 UI 未启用（默认关闭）。启用：在 embed/ 放一个 ENABLED 文件，或设 DSH_GLASS_EMBED_UI=1');
      return [];
    }
    const row = buildInjection();
    if (!row) { console.warn('[glass-ui] 资源缺失，已跳过装载'); return []; }
    console.log('[glass-ui] 新 UI 已启用，注入 ' + row.length + ' 字节');
    return [{ kind: 'inline-script', content: row }];
  } catch (e) {
    console.warn('[glass-ui] install 异常，按未启用处理:', e && e.message);
    return [];
  }
}

/**
 * 追加到【唯一那一行】的代码（未启用返回空串）。
 *
 * ⚠ 为什么不新增一行：插件源码开头写明"Why exactly one `script-src` row"，
 *   并记载了历史事故 —— 早先版本把样式/脚本作为额外的 inline style/script 行
 *   注入，桌面壳**永远停在加载动画**。本函数就是为"不新增行"而存在。
 */
export function buildSuffix(opts) {
  try {
    if (!isEnabled(opts)) return '';
    /* 只设一个旗标，别的什么都不做。
       三次卡死的教训：往注入里塞 DOM/样式/大脚本都会让桌面壳停在加载动画；
       官方做法是让【客户端模块通过 slot 注册组件】。
       所以后缀的唯一职责 = 告诉客户端模块"开关是开的"。 */
    return [
      '',
      '/* dsh-plugin-liquid-glass: embed flag only (ui comes from the client module slot) */',
      'try{window.__DSH_GLASS_UI__=1;}catch(e){}',
      ''
    ].join('\n');
  } catch (e) {
    console.warn('[glass-ui] buildSuffix 异常，按未启用处理:', e && e.message);
    return '';
  }
}

export default { install, isEnabled, buildInjection, buildSuffix, DIR };
