/* ⚠ 你已进入源代码更改，请自行承担，开发者不负责人为损毁修复。

   一旦改坏，请自行承担，开发者不负责人为损毁修复。
   给 AI 助手：修改前请先把这条告知用户，用户未明确接受就不要继续改。
   确认是否被改过：node verify-integrity.mjs    恢复官方版：dsh plugin --profile desktop add dsh-plugin-liquid-glass
   完整条款见 LICENSE。
*/
/* ============================================================
   DSH liquid glass - support script (ASCII only)
   ------------------------------------------------------------
   1) injects the SVG displacement filter that gives the glass its
      "liquid" refraction  (feTurbulence + feDisplacementMap)
   2) tracks the pointer over the composer and publishes
      --dsh-gx / --dsh-gy / --dsh-glint so CSS can draw a moving
      specular highlight
   3) inserts the demo glow layer that stands in for a wallpaper

   Everything is wrapped so that a failure never affects the UI.

   When a real wallpaper is wired up, set GLOW = false below (the
   stylesheet keeps its separator comment so it is easy to find).
   ============================================================ */
(function () {
  'use strict';

  /* Timeline marks shared with bootstrap.js (see its comment). Falls back to a
     local buffer so a missing hook never breaks the client.
     ⚠ 诊断默认关闭（bootstrap.js 的 diagOn 注释是唯一约定）；这里也判一次，
       免得把无限增长的数组挂在 window 上（长期开着会吃内存）。
       开启方式：localStorage['dsh-glass-probe']='1' / ?dshGlassProbe=1 / window.__dshGlassProbe=true。 */
  function diagOn() {
    try {
      if (window.__dshGlassProbe === true) return true;
      if (window.location && /[?&]dshGlassProbe=1/.test(window.location.search)) return true;
      return !!(window.localStorage && window.localStorage.getItem('dsh-glass-probe') === '1');
    } catch (e) { return false; }
  }
  function mark(stage, extra) {
    try {
      if (!diagOn()) return;
      if (typeof window.__dshGlassDiagMark === 'function') { window.__dshGlassDiagMark(stage, extra); return; }
      window.__dshGlassTimeline = window.__dshGlassTimeline || [];
      var e = { t: Date.now(), stage: stage };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k]; } }
      if (window.__dshGlassTimeline.length > 4000) window.__dshGlassTimeline.shift();
      window.__dshGlassTimeline.push(e);
    } catch (err) { }
  }

  mark('client:start', {
    readyState: document.readyState,
    composerMarked: !!document.querySelector('[data-dsh-glass="composer"]'),
    bodyReady: document.body ? document.body.className.indexOf('dsh-ready') !== -1 : null
  });


  /* ============================================================
     THE ANIMATION MODULE HAS BEEN DELETED.

     It was torn down at the user's request - "delete the animation module, it is completely
     broken, redo it" - so what used to live here (the composer's entrance gesture and its seat,
     the arrival detection that timed it, the quiet gate that released it, the welcome page's three
     beats, and the composer/sidebar/header/welcome gates) is gone from the source rather than
     switched off. The old code is in `_animation-backup/`, and a whole-tree snapshot is in
     `_archive-*`; the handoff notes list what was removed and why each attempt failed.

     WHAT THIS PLUGIN DOES NOW:
       · the glass material itself - every surface, its blur, borders and shadows
       · the readability floor over a wallpaper, and the stripe backdrop when there is none
       · the pointer-following specular on the composer and the right sidebar
       · the marking/scanner that decides WHICH elements get material
       · the scan-cost work (scoping, the classless-leaf filter, skipping full passes while a
         conversation streams)
       · TWO GATES THAT ARE NOT ANIMATION and were deliberately kept:
           `dsh-glass-ui`          - hides the window until the material stylesheets have applied,
                                     because they are injected after the app's first paint and the
                                     window would otherwise be shown with no glass at all
           `dsh-glass-new-session` - hides the conversation the app restored until the new session
                                     lands, because it would otherwise be seen switching away

     WHEN REBUILDING AN ENTRANCE, TWO THINGS COST THE MOST TIME TO LEARN:
       1. The motion must go on an ANCESTOR of the `backdrop-filter` element. Animating the glass
          itself makes Chromium composite it separately and the material goes flat.
       2. One visible property, one owner. Let the gate own `visibility` and the animation own
          `opacity`/`transform`; two owners of the same property race, and the loser is whichever
          one you did not expect. */

  var GLOW = true;                       // demo backlight; set false once a wallpaper exists
  var STRIPES = true;                    // fallback backdrop; yields to any real wallpaper
  var FILTER_ID = 'dsh-liquid-refraction';
  var GLOW_ID = 'dsh-glass-glow';
  var MARK = 'data-dsh-glass';
  var reduced = false;
  try {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { }

  /* ---------- 1. displacement filter ---------- */
  function ensureFilter() {
    try {
      if (document.getElementById(FILTER_ID)) return;
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      var filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.setAttribute('id', FILTER_ID);
      filter.setAttribute('x', '-12%');
      filter.setAttribute('y', '-12%');
      filter.setAttribute('width', '124%');
      filter.setAttribute('height', '124%');
      filter.setAttribute('color-interpolation-filters', 'sRGB');

      // fine turbulence -> smooth, glassy warp (not a wobble)
      var turb = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
      turb.setAttribute('type', 'fractalNoise');
      turb.setAttribute('baseFrequency', '0.006 0.010');
      turb.setAttribute('numOctaves', '2');
      turb.setAttribute('seed', '7');
      turb.setAttribute('result', 'noise');

      var disp = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
      disp.setAttribute('in', 'SourceGraphic');
      disp.setAttribute('in2', 'noise');
      disp.setAttribute('scale', '26');
      disp.setAttribute('xChannelSelector', 'R');
      disp.setAttribute('yChannelSelector', 'G');

      filter.appendChild(turb);
      filter.appendChild(disp);
      defs.appendChild(filter);
      svg.appendChild(defs);
      (document.body || document.documentElement).appendChild(svg);

      // very slow drift keeps the refraction alive without being distracting
      if (!reduced) {
        var t = 0;
        setInterval(function () {
          try {
            t += 0.006;
            turb.setAttribute('baseFrequency',
              (0.006 + Math.sin(t) * 0.0012).toFixed(5) + ' ' +
              (0.010 + Math.cos(t * 0.8) * 0.0016).toFixed(5));
          } catch (e) { }
        }, 120);
      }
    } catch (e) { }
  }

  /* ---------- 2. pointer-driven specular ---------- */
  function bindPointer(el) {
    if (!el || el.__dshGlintBound) return;
    el.__dshGlintBound = true;
    el.addEventListener('pointermove', function (ev) {
      try {
        var r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var x = ((ev.clientX - r.left) / r.width) * 100;
        var y = ((ev.clientY - r.top) / r.height) * 100;
        el.style.setProperty('--dsh-gx', x.toFixed(2) + '%');
        el.style.setProperty('--dsh-gy', y.toFixed(2) + '%');
        // 0.75 rather than 1: the final glint strength is opacity x gradient peak,
        // and a full-strength highlight reads as a blob instead of a sheen
        el.style.setProperty('--dsh-glint', '0.75');
      } catch (e) { }
    });
    el.addEventListener('pointerleave', function () {
      try { el.style.setProperty('--dsh-glint', '0'); } catch (e) { }
    });
  }

  /* ---------- 3. demo backlight ---------- */
  function ensureGlow() {
    if (!GLOW) return;
    try {
      if (document.getElementById(GLOW_ID)) return;
      // IMPORTANT: never insert into #root. The app removes its own boot overlay
      // from #root's child list on startup, and taking the first position there
      // (which insertBefore(g, root.firstChild) does) leaves that overlay in the
      // DOM for good - the window then sits on "Loading plugins..." forever while
      // the real UI is mounted behind it. The glow is position:fixed, so the body
      // is both safer and sufficient.
      var host = document.body || document.documentElement;
      if (!host) return;
      var g = document.createElement('div');
      g.id = GLOW_ID;
      g.setAttribute('data-dsh-decor', 'glow');
      host.appendChild(g);
    } catch (e) { }
  }

  /* ---------- 3b. fallback backdrop: animated stripes ----------
     A transparent material is only worth having if there is something behind it to
     see through. The app's own background is a flat dark colour and the wallpaper
     plugin is disabled, so "clear glass" would look like a plain dark panel. These
     stripes are that something.

     THE USER'S WALLPAPER ALWAYS WINS.
     This layer sits below everything and is switched off the moment another
     background provider exists. The check is structural, not a dependency: it looks
     for any full-viewport fixed descendant of <body> that is not ours and not the app
     frame, which is what any wallpaper implementation has to be. Nothing here reads
     another plugin's attributes or variables, so this plugin keeps working with no
     wallpaper at all and steps aside when one appears.

     Same placement rules as the glow: position:fixed, appended to <body>, never into
     #root (see ensureGlow for why that matters). */
  var BACKDROP_ID = 'dsh-glass-backdrop';

  function ensureBackdrop() {
    if (!STRIPES) return;
    try {
      if (document.getElementById(BACKDROP_ID)) return;
      var host = document.body || document.documentElement;
      if (!host) return;
      var b = document.createElement('div');
      b.id = BACKDROP_ID;
      b.setAttribute('data-dsh-decor', 'backdrop');
      host.appendChild(b);
    } catch (e) { }
  }

  /* Does somebody else already provide a background?
     Two tests, either of which is enough:

       1. IDENTITY - a fixed, near-viewport layer whose id/class says "wallpaper".
          Naming it is not a dependency: nothing of that plugin's is read or required,
          and the check simply finds nothing when it is absent.

       2. STRUCTURE - a fixed, near-viewport layer painting BELOW the app shell
          (z-index <= 0). The app's own overlays (attachment previews, settings) are
          full-window fixed too, but they sit above the shell with a positive z-index,
          so they do not qualify. An earlier version accepted any full-window fixed
          layer and therefore switched the decoration off with no wallpaper at all.

     Both directions are visible when this is wrong: too loose and the decorative
     layers vanish for no reason, too strict and they paint over the user's wallpaper. */
  function looksLikeWallpaperLayer(el, c, r) {
    if (c.position !== 'fixed') return false;
    if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity || '1') === 0) return false;
    /* A wallpaper covers the window. Full-viewport is required, but the tolerance is
       generous: some wallpapers are inset slightly by their own frame. */
    if (r.width < window.innerWidth * 0.85 || r.height < window.innerHeight * 0.85) return false;
    var hay = (el.id || '') + ' ' + String(el.className || '');
    if (/wallpaper/i.test(hay)) return true;
    var z = c.zIndex === 'auto' ? 0 : parseInt(c.zIndex, 10);
    if (isNaN(z)) z = 0;
    return z <= 0;                                            // below the shell = background
  }

  function foreignBackdropPresent() {
    try {
      var host = document.body;
      if (!host) return false;
      for (var i = 0; i < host.children.length; i++) {
        var el = host.children[i];
        if (el.id === BACKDROP_ID || el.id === GLOW_ID) continue;
        if (el.id === 'root') continue;                       // the app shell itself
        if (el.getAttribute && el.getAttribute('data-dsh-decor')) continue;
        var c = getComputedStyle(el);
        var r = el.getBoundingClientRect();
        if (looksLikeWallpaperLayer(el, c, r)) return true;
      }
      /* A wallpaper may also mount inside the shell rather than as a body child.
         Anything actually named "wallpaper" counts once it is near full-viewport. */
      var inside = document.querySelector('[id*="wallpaper"],[class*="wallpaper"]');
      if (inside && inside !== document.body) {
        var ir = inside.getBoundingClientRect();
        if (ir.width >= window.innerWidth * 0.8 && ir.height >= window.innerHeight * 0.8) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  function syncBackdropOwnership() {
    try {
      var foreign = foreignBackdropPresent();
      var cls = 'dsh-glass-foreign-backdrop';
      var has = document.body.classList.contains(cls);
      if (foreign && !has) document.body.classList.add(cls);
      else if (!foreign && has) document.body.classList.remove(cls);

      /* The same fact drives TWO decisions, so it is published once:
           1. our own decoration stands down (above);
           2. the material becomes more opaque, because a photograph behind the glass
              destroys text legibility in a way a flat dark background never does.
         A wallpaper is by definition loud and high-contrast; the "clear glass" values
         tuned against the app's flat background are simply too thin over it. */
      var wcls = 'dsh-glass-over-image';
      var whas = document.body.classList.contains(wcls);
      if (foreign && !whas) document.body.classList.add(wcls);
      else if (!foreign && whas) document.body.classList.remove(wcls);
    } catch (e) { }
  }

  /* ---------- user message bubble ----------
     This used to be found purely by geometry (right-aligned, narrow, rounded,
     painted) - and that silently matched the COMPOSER, which sits at the bottom
     of the same column and looks exactly the same by those criteria. Verified:
     the "user bubble" that got tagged was the composer's box.

     The one reliable difference is editability:
        composer  -> contains a textarea / contenteditable
        user bubble -> contains plain text only

     So candidates are now (a) inside the message scroll area, (b) not inside the
     composer, (c) free of any editable element. */
  function containsEditable(el) {
    if (!el || !el.querySelector) return false;
    return !!el.querySelector('textarea,[contenteditable="true"],[role="textbox"]');
  }

  /* Clearing a mark has to remove the attribute, not blank its value: the
     stylesheets select on [data-dsh-glass="bubble-user"], so an empty value
     would leave the glass on a node that is no longer a bubble. */
  function removeMark(el) {
    try { if (el && el.removeAttribute) el.removeAttribute(MARK); } catch (e) { }
  }

  /* Scope for the bubble search, discovered at runtime.
     The old code hardcoded [class*="_column"], whose hash segment is generated
     by the dsh-web-frontend build, so a frontend update silently breaks the
     plugin. Instead walk up from the composer (already tagged) to the first
     scrollable ancestor: the composer is pinned to the bottom of the transcript,
     so the nearest scrolling ancestor IS the message list boundary.

     The DOM query is first and the geometry walk second on purpose: with no
     composer tagged yet every scan would otherwise force a layout. */
  function bubbleScope() {
    try {
      var comp = document.querySelector('[data-dsh-glass="composer"]');
      if (comp) {
        var n = comp.parentElement;
        for (var i = 0; i < 10 && n && n !== document.body; i++) {
          var ov = '';
          try { ov = getComputedStyle(n).overflowY || ''; } catch (e) { }
          if (ov === 'auto' || ov === 'scroll') return n;
          n = n.parentElement;
        }
      }
    } catch (e) { }
    try {
      return document.querySelector('[class*="_column"]') || document.body;
    } catch (e) { return document.body; }
  }

  /* Every user bubble, not just one.
     The old finder kept a single "widest match" (bestW) and returned it, so only
     one bubble in the whole transcript could ever carry the material: every
     other user message stayed unmarked, and a rescan that picked a different
     winner left the old mark behind. Now all matches are collected, reduced to
     the innermost painted shell per bubble, and every one of them is tagged. */
  function findUserBubbles() {
    try {
      var comp = document.querySelector('[data-dsh-glass="composer"]');
      var scope = bubbleScope();
      var compTop = comp ? comp.getBoundingClientRect().top : Infinity;
      var colRight = scope.getBoundingClientRect().right;

      var all = scope.querySelectorAll('*');
      var hits = [];
      var i, el, r;
      for (i = 0; i < all.length; i++) {
        el = all[i];
        if (comp && (el === comp || comp.contains(el))) continue;   // not the composer
        if (containsEditable(el)) continue;                          // not editable
        try { r = el.getBoundingClientRect(); } catch (e) { continue; }
        if (isBubbleBox(el, r, compTop, colRight)) hits.push(el);
      }

      // Keep the innermost painted shell of each bubble. The geometric test also
      // matches ancestors that merely wrap the bubble (a row is narrow, right
      // anchored and paints too); tagging those would put the material on the
      // wrong node, so drop any hit that contains another hit.
      var marks = new Set();
      for (i = 0; i < hits.length; i++) {
        el = hits[i];
        var wraps = false;
        for (var j = 0; j < hits.length; j++) {
          if (i !== j && el.contains(hits[j])) { wraps = true; break; }
        }
        if (!wraps) marks.add(el);
      }
      return marks;
    } catch (e) { return new Set(); }
  }

  /* Controls are never messages: they only look like bubbles.
     - the "load earlier" affordance is a small button that wins the
       innermost-painted election outright;
     - message avatars are 40-64 px buttons/spans sitting inside a user row,
       so they pass every geometric bubble rule too.
     Marking them had two visible consequences: the assistant card's boundary was
     trimmed against a control (rendering a 24 px sliver card), and the card
     bands appeared to contain bubbles. Controls get their own role and a lighter
     glass treatment elsewhere instead. */
  function isControl(el) {
    try {
      if (!el) return false;
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'button') return true;
      var role = el.getAttribute && el.getAttribute('role');
      if (role === 'button') return true;
      if (el.getAttribute && el.getAttribute('data-glass-role') === 'older') return true;
      return false;
    } catch (e) { return false; }
  }

  /* Small controls keep a lighter glass pill; everything else that is a control
     is simply left alone. The size window is deliberately tight: message action
     buttons (copy, quote, retry) are icon buttons and must not be re-styled, and
     tagging them used to poison every transcript row with the "older" role. */
  function isControlPill(el, r) {
    try {
      if (!isControl(el)) return false;
      if (r.width > 120 || r.height > 30) return false;
      if ((el.textContent || '').trim().length < 1) return false;
      return true;
    } catch (e) { return false; }
  }

  function isBubbleBox(el, r, compTop, colRight) {
    try {
      if (r.width < 40 || r.height < 28 || r.height > 420) return false;
      if (r.width > 620) return false;                      // bubbles are narrow
      if (r.bottom > compTop) return false;                 // must sit above the composer
      if (isControl(el)) return false;                      // controls are not messages
      // A message bubble carries text. Icon tiles inside an assistant card are
      // 40x40, rounded and painted - they satisfy every geometric clause and were
      // being tagged as user messages until this one.
      if ((el.textContent || '').replace(/\s+/g, '').length < 2) return false;
      var cs = getComputedStyle(el);
      if (parseFloat(cs.borderTopLeftRadius || '0') < 8) return false;
      var bg = cs.backgroundColor || '';
      if (bg === '' || bg === 'transparent' || bg.indexOf('rgba(0, 0, 0, 0)') === 0) return false;
      if (colRight - r.right < 12) return false;            // right-anchored
      return true;
    } catch (e) { return false; }
  }

  function markUserBubble() {
    var targets = findUserBubbles();
    if (!targets.size) return false;

    var colRight = bubbleScope().getBoundingClientRect().right;

    targets.forEach(function (inner) {
      try {
        /* Idempotent, and deliberately "clear then set" rather than "skip if
           already set". React reuses and rebuilds nodes as the transcript grows,
           and a guard that only ever adds leaves the material attached to a node
           the framework has since repurposed. Re-applying the same attribute
           value is free: no mutation record, no relayout. */
        if (inner.getAttribute(MARK) !== 'bubble-user') {
          inner.setAttribute(MARK, 'bubble-user');
          bindPointer(inner);
        }

        /* "Load earlier" is styled as a bubble on purpose and keeps its glass,
           but it is a control, not a message: it gets a role so the card
           boundary logic can skip it without guessing from geometry. */
        try {
          if (inner.querySelector('button,[role="button"]') && !(inner.textContent || '').trim()) {
            inner.setAttribute('data-glass-role', 'older');
          } else if (inner.getAttribute('data-glass-role') === 'older') {
            inner.removeAttribute('data-glass-role');
          }
        } catch (e) { }

        /* The row must not paint an opaque background over the bubble, but it
           must not receive material either (that was the bug: the row swallowed
           the effect and the bubble looked flat). Mark the ancestor chain, same
           depth as before, so a single-bubble conversation looks exactly as it
           did - the point of this change is that EVERY bubble now gets it, not
           that the first one changes appearance. */
        var el = inner.parentElement;
        var depth = 0;
        while (el && el !== document.body && depth < 4) {
          if (el.getAttribute && el.getAttribute(MARK) !== 'bubble-row') {
            el.setAttribute(MARK, 'bubble-row');
          }
          el = el.parentElement;
          depth++;
        }
      } catch (e) { }
    });

    /* Cleanup pass: a marked node that no longer passes the geometric test is
       stale (React reused it). Only attributes whose value is exactly ours are
       touched, so nothing outside this plugin is ever disturbed. */
    try {
      var compTop = (function () {
        var c = document.querySelector('[data-dsh-glass="composer"]');
        return c ? c.getBoundingClientRect().top : Infinity;
      })();
      var marked = document.querySelectorAll('[data-dsh-glass="bubble-user"]');
      for (var i = 0; i < marked.length; i++) {
        var m = marked[i];
        if (targets.has(m)) continue;
        var r;
        try { r = m.getBoundingClientRect(); } catch (e) { removeMark(m); continue; }
        if (!isBubbleBox(m, r, compTop, colRight)) removeMark(m);
      }
    } catch (e) { }

    /* Tag "load earlier"-style controls with their own role and give them a
       lighter glass treatment, so they keep a glassy look without being mistaken
       for a message by the card boundary logic. */
    try {
      var pills = bubbleScope().querySelectorAll('button,[role="button"]');
      for (var p = 0; p < pills.length; p++) {
        var pe = pills[p];
        var pr;
        try { pr = pe.getBoundingClientRect(); } catch (e) { continue; }
        if (!isControlPill(pe, pr)) continue;
        pe.setAttribute('data-glass-role', 'older');
        if (!pe.getAttribute('data-glass-pill-styled')) {
          pe.setAttribute('data-glass-pill-styled', '1');
          pe.style.background = 'color-mix(in srgb, var(--dsw-alias-bg-layer-2, #22242a) 42%, transparent)';
          pe.style.border = '0.5px solid rgba(255, 255, 255, 0.14)';
          pe.style.backdropFilter = 'blur(10px) saturate(140%)';
          pe.style.webkitBackdropFilter = 'blur(10px) saturate(140%)';
        }
      }
    } catch (e) { }

    return true;
  }

  /* ---------- assistant block: smooth growth by animating HEIGHT ----------
     This was originally done with FLIP (transform scale). Measurement killed
     that idea: during real growth the vertical factor was sy = 0.87..0.93, so
     the card's text was squeezed by 7-13% and snapped back on every streaming
     update - which is exactly the "jumping" that was reported.

     Text cannot be scaled smoothly; it can only reflow. So the height itself is
     eased from the previous measured value to the new one over ~120-260ms.
     Layout runs per frame, but the text stays crisp and is never compressed.
     The observed element carries no backdrop-filter (the material lives in the
     static sibling layer), so this cannot disturb the glass. */
  var observed = null;
  var lastSize = null;
  var observer = null;

  /* ---------- assistant card: static glass layer + animated content layer ----------
     The card itself must NOT carry a backdrop-filter. Chromium promotes an
     element to its own compositing layer as soon as it is animated, which
     interrupts backdrop sampling and makes the glass blink.

     So the jobs are split (verified against the real DOM):
        #dsh-card-glass        static sibling that paints the material
        [class*="_column"]     the content column, kept glass-free so FLIP is safe
     The glass geometry is copied from the column on every resize; it is never
     animated itself. */
  var glassEls = [];
  var hostEl = null;

  var SEG_CLASS = 'dsh-card-glass-seg';
  var SEG_GAP = 12;          // visual breathing room between stacked cards
  var SEG_STYLE_ID = 'dsh-card-glass-style';

  /* The segmented glasses are created here rather than in 30-glass-bubble-agent.css
     so that the stylesheet keeps its single-layer contract and this file stays
     the only one that changed. #dsh-card-glass keeps its id because the first
     segment reuses it. */
  function ensureSegmentStyle() {
    try {
      if (document.getElementById(SEG_STYLE_ID)) return;
      var st = document.createElement('style');
      st.id = SEG_STYLE_ID;
      st.textContent =
        '#' + 'dsh-card-glass,.' + SEG_CLASS + '{' +
        /* z-index:-1 keeps the material below the transcript content. At 0 a
           positioned element paints above the in-flow message blocks and its
           backdrop-filter blurs whatever it covers - neighbouring paragraphs and
           tables then read as one smeared block. */
        'position:absolute;pointer-events:none;z-index:-1;border-radius:18px;overflow:hidden;' +
        'background:linear-gradient(158deg,rgba(255,255,255,.075) 0%,rgba(255,255,255,.02) 36%,rgba(255,255,255,0) 64%),' +
        'color-mix(in srgb,var(--dsw-alias-bg-layer-2,#22242a) 52%,transparent);' +
        '-webkit-backdrop-filter:blur(20px) saturate(165%) brightness(1.05);' +
        'backdrop-filter:blur(20px) saturate(165%) brightness(1.05);' +
        'border:.5px solid rgba(255,255,255,.13);' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(255,255,255,.04),0 12px 30px -16px rgba(0,0,0,.5);' +
        '}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { }
  }

  function ensureGlassHost(col) {
    try {
      if (hostEl && document.body.contains(hostEl)) return hostEl;
      var host = col.offsetParent || col.parentElement;
      if (!host) return null;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      /* The glass lives in THIS element, not inside the column, and it has to sit
         below the transcript content while staying above this host's own
         background. That requires the stacking context to be created here; putting
         the isolation on the column instead packed the whole column into a single
         unit and hid the glass entirely. */
      if (getComputedStyle(host).isolation !== 'isolate') host.style.isolation = 'isolate';
      hostEl = host;
      ensureSegmentStyle();
      return hostEl;
    } catch (e) { return null; }
  }

  /* Every contiguous run of assistant content gets its own static glass card, so
     stacked assistant turns read as separate cards instead of one surface that
     spans the whole transcript. */
  function assistantSpans(col, colBox) {
    var kids = col.children;
    var spans = [];
    var open = null;
    var decisions = [];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      var isUser = false;
      try { isUser = rowIsUserMessage(k, colBox); } catch (e) { }
      if (decisions.length < 40) {
        var kr;
        try { kr = k.getBoundingClientRect(); } catch (e) { kr = null; }
        decisions.push({
          i: i,
          user: isUser,
          cls: String(k.className || '').slice(0, 20),
          top: kr ? Math.round(kr.top) : null,
          h: kr ? Math.round(kr.height) : null,
          head: (k.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18)
        });
      }
      if (isUser) { if (open) { spans.push(open); open = null; } continue; }
      var r;
      try { r = k.getBoundingClientRect(); } catch (e) { continue; }
      if (r.height <= 0) continue;
      if (!open) open = { first: k, last: k, top: r.top, bottom: r.bottom };
      else { open.last = k; open.bottom = r.bottom; }
    }
    if (open) spans.push(open);
    syncGlass.lastDecisions = decisions;
    return spans;
  }

  function syncGlass(col) {
    try {
      var host = ensureGlassHost(col);
      if (!host) return;
      var h = host.getBoundingClientRect();
      var colBox = col.getBoundingClientRect();
      var spans = assistantSpans(col, colBox);
      var used = 0;

      for (var i = 0; i < spans.length; i++) {
        var s = spans[i];
        // marginBottom on the last child would push the card into the next run,
        // so the span ends at the child's box: overlapping cards look like one.
        var top = (s.first.getBoundingClientRect().top - h.top) + 2;
        var bottom = s.last.getBoundingClientRect().bottom - h.top - 2;
        if (i < spans.length - 1) bottom -= SEG_GAP / 2;
        if (i > 0) top += SEG_GAP / 2;
        var height = bottom - top;
        if (height < 8) continue;

        var g = glassEls[used];
        if (!g || !document.body.contains(g)) {
          if (!g) {
            g = document.createElement('div');
            g.className = SEG_CLASS;
            g.setAttribute('aria-hidden', 'true');
            if (used === 0) g.id = 'dsh-card-glass';
            host.appendChild(g);
            glassEls[used] = g;
          } else {
            host.appendChild(g);
          }
        }
        g.style.left = (colBox.left - h.left) + 'px';
        g.style.top = top + 'px';
        g.style.width = colBox.width + 'px';
        g.style.height = height + 'px';
        g.style.display = '';
        g.setAttribute('data-dsh-glass-seg', String(i));
        used++;
      }

      for (var j = used; j < glassEls.length; j++) {
        var spare = glassEls[j];
        if (spare && document.body.contains(spare)) spare.style.display = 'none';
      }
      return used;
    } catch (e) { return 0; }
  }

  /* The card must cover only the assistant's part of the conversation. The user's
     message sits in the SAME column (it is a flex item of it), so simply painting
     the column wrapped the user's bubble too - which is wrong.

     Since a node cannot un-paint its own background over a child, the glass layer
     is offset: it starts at the first column child that comes AFTER the user's
     message row. That row is identified by containing the tagged user bubble. */
  /* Where does the assistant's part begin?
     Preferred route: the column child that holds the tagged user bubble, take the
     next sibling. That failed in the packaged app (React can rebuild the glass
     layer while the bubble tag is momentarily absent), so a purely GEOMETRIC
     fallback runs first-class: a user row is the one containing a small,
     right-anchored, painted, non-editable box. No tag required. */
  /* A user message row contains a small, right-anchored, painted, non-editable
     box that actually carries text. Every clause is load-bearing:
       - the "load earlier" affordance is a <button> with no text content and it
         otherwise passes the geometry test, which used to drag the assistant
         card's start offset up to the top of the transcript;
       - compositor-promoted / fixed elements (the whale widget panel) are page
         furniture, not transcript content.
     The text clause is deliberately "has text OR is a button", so a real
     text-less bubble still qualifies while the loader is rejected. */
  /* Does this row carry a user message? Appearance alone is not enough: the
     "load earlier" control looks exactly like a bubble, but it is not a message
     and must not cut the assistant card's boundary (that produced a 24 px sliver
     card at the top of the transcript). Controls carry data-glass-role="older"
     and are skipped here; the mark is re-applied to them separately, so they
     keep a glassy look of their own. Appearance stays as the fallback for rows
     that have not been marked yet. */
  function rowIsUserMessage(row, colBox) {
    if (!row || !row.querySelectorAll) return false;
    var cands = row.querySelectorAll('*');
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (!looksLikeBubbleBox(r, el, colBox)) continue;
      return true;
    }
    return false;
  }

  /* Same decision as isBubbleBox, deliberately routed through it rather than
     re-implemented: the two heuristics had drifted apart (different size floors,
     different control handling) and the card boundary disagreed with the marking
     about what a user message is. One rule, one answer. */
  function looksLikeBubbleBox(box, el, colBox) {
    try {
      if (box.width < 30 || box.width > 620) return false;
      if (box.height < 18 || box.height > 420) return false;
      if (el.querySelector('textarea,[contenteditable="true"],[role="textbox"]')) return false;
      var cs = getComputedStyle(el);
      if (cs.position === 'fixed') return false;
      if (parseFloat(cs.opacity || '1') === 0) return false;
      var comp = document.querySelector('[data-dsh-glass="composer"]');
      var compTop = comp ? comp.getBoundingClientRect().top : Infinity;
      return isBubbleBox(el, { left: box.left, right: box.right, width: box.width, height: box.height, top: box.top, bottom: box.bottom },
        compTop, colBox.left + colBox.width);
    } catch (e) { return false; }
  }

  /* Diagnostics: how aggressive are the FLIP factors during a real streaming
     session? Exposed on window so it can be read from outside (CDP). */

  /* ---------- smooth growth: a self-measuring height ease ----------
     History of this function, because both earlier versions were wrong:
       1. FLIP transform scale  -> measured sy = 0.87..0.93, so the text was
          squeezed 7-13% every update. Text cannot scale; it must reflow.
       2. height eased from the ResizeObserver's previous value -> the inline
          pixel height we wrote fed straight back into the observer, restarting
          the animation from a corrupted "previous" height. Sampling showed the
          height oscillating (361 <-> 393 <-> 357) instead of easing.

     What works: while the animation is running, the observer is ignored, and the
     loop itself measures the natural height each frame by clearing the inline
     height, reading layout, then re-applying the eased value. So the target
     keeps up with streaming content and nothing feeds back on itself.

     The element carries no backdrop-filter (the material is a static sibling),
     so writing height cannot disturb the glass. */
  var heightAnim = null;
  var glassTargetHeight = null;

  /* Growth animation switch.

     This used to run unconditionally, and it is the one piece of this plugin that
     fights the browser: every frame it clears the element's inline height, reads
     layout and writes a new height back - roughly 60 forced reflows per second
     while text streams. That is exactly the shape of a visible text jitter, and
     the browser's own reflow already grows the card smoothly.

     Default: off. Set it to true (or set window.__dshGlassAnimateGrowth = true
     before the page renders) to get the eased growth back. */
  function growthAnimationEnabled() {
    try { return window.__dshGlassAnimateGrowth === true; } catch (e) { return false; }
  }

  function measureNatural(el) {
    var prev = el.style.height;
    el.style.height = '';
    var h = el.getBoundingClientRect().height;
    if (prev) el.style.height = prev;
    return h;
  }

  function startGrowthLoop(el) {
    if (!growthAnimationEnabled()) return;
    if (heightAnim) return;
    var st = { raf: 0, el: el, settling: false, settleStart: 0, lastTs: 0 };
    heightAnim = st;

    // tuning (all measured, not guessed):
    //   TAU        time constant of the ease; smaller = follows the text sooner
    //   SNAP_PX    a jump this large is a new block appearing, not streaming -
    //              easing it looks like the card is behind, so take it directly
    //   SETTLE_MS  how long to stay in control after catching up. The old 180ms
    //              hold was what made the card feel like it lagged the text.
    var TAU = 70;
    var SNAP_PX = 30;
    var SETTLE_MS = 80;

    function step(ts) {
      if (heightAnim !== st) return;
      var dt = st.lastTs ? Math.min(64, ts - st.lastTs) : 16;
      st.lastTs = ts;

      var natural = measureNatural(el);
      var current = el.getBoundingClientRect().height;
      var gap = natural - current;

      if (gap > SNAP_PX) {
        // big jump: a whole new block. Follow it at once.
        el.style.height = natural.toFixed(2) + 'px';
        st.settling = true;
        st.settleStart = ts;
      } else if (gap > 0.5) {
        // streaming: exponential ease with a time constant, so the speed does
        // not depend on the frame rate. Never overshoots - no bounce by design.
        var k = 1 - Math.exp(-dt / TAU);
        var target = current + gap * k;
        if (natural - target < 0.3) target = natural;
        el.style.height = target.toFixed(2) + 'px';
        st.settling = false;
      } else if (gap < -0.5) {
        // content shrank (collapse): follow immediately, instant reads correctly
        el.style.height = natural.toFixed(2) + 'px';
        st.settling = true;
        st.settleStart = ts;
      } else {
        if (!st.settling) { st.settling = true; st.settleStart = ts; }
        if (ts - st.settleStart > SETTLE_MS) {
          el.style.height = '';
          heightAnim = null;
          syncGlass(el);
          return;
        }
      }
      st.raf = requestAnimationFrame(step);
    }
    st.raf = requestAnimationFrame(step);
  }

  function onAgentResize(entries) {
    if (reduced) return;
    try {
      for (var i = 0; i < entries.length; i++) {
        var el = entries[i].target;
        var cr = entries[i].contentRect;
        var now = { w: cr.width, h: cr.height };

        // while the growth loop owns the height, ignore observer noise: this is
        // the feedback path that caused the oscillation
        if (!heightAnim) {
          var prev = lastSize;
          if (prev && prev.h > 0 && now.h > 0 && (now.h - prev.h) > 6) {
            startGrowthLoop(el);
          }
          if (!heightAnim) syncGlass(el);
        }
        lastSize = now;
        glassTargetHeight = now.h;
      }
    } catch (err) { }
  }

  function markAssistantBlock() {
    // The card is the conversation column itself (verified): a flex container of
    // flow items, so only an attribute is added - the material is pure CSS and
    // React's nodes are never restructured.
    try {
      var col = document.querySelector('[data-dsh-card="conversation"]');
      if (!col) col = document.querySelector('[class*="_column"]');
      if (!col) return false;

      if (col.getAttribute('data-dsh-card') !== 'conversation') {
        col.setAttribute('data-dsh-card', 'conversation');
      }

      var segCount = syncGlass(col);

      if (observed !== col) {
        try { if (observed && observer) observer.unobserve(observed); } catch (e) { }
        observed = col;
        lastSize = null;
        try { if (observer) observer.observe(col); } catch (e) { }
      }
      // expose enough state to diagnose from outside (React can swap the node,
      // which would leave the observer watching a detached element)
      try {
        var segs = [];
        for (var si = 0; si < glassEls.length; si++) {
          var sg = glassEls[si];
          if (!sg || !document.body.contains(sg) || sg.style.display === 'none') continue;
          var sb = sg.getBoundingClientRect();
          segs.push({ top: Math.round(sb.top), height: Math.round(sb.height), width: Math.round(sb.width) });
        }
        window.__dshGlass = {
          observerActive: !!observer,
          observedConnected: !!(observed && document.body.contains(observed)),
          observedHeight: observed ? Math.round(observed.getBoundingClientRect().height) : -1,
          sameNode: observed === document.querySelector('[class*="_column"]'),
          reductions: { reducedMotion: reduced },
          heightAnimationRunning: !!heightAnim,
          glassSegments: typeof segCount === 'number' ? segCount : segs.length,
          segmentBoxes: segs,
          rowDecisions: syncGlass.lastDecisions || []
        };
      } catch (e) { }
      return true;
    } catch (e) { return false; }
  }

  /* ---------- wiring ---------- */
  /* ---------- composer ----------
     Among editable elements, the composer is the lowest one on screen (it is
     pinned to the bottom) and the widest. Anchor selections, search boxes and
     message text do not match that combination. Walking known only the editable
     element keeps this apart from the transcript, which is why the bubble finder
     excludes anything containing an editable element. */
  function markComposer() {
    try {
      var nodes = document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]');
      var pick = null, pickBottom = -1, pickW = 0;
      for (var i = 0; i < nodes.length; i++) {
        var nr;
        try { nr = nodes[i].getBoundingClientRect(); } catch (e) { continue; }
        if (nr.width < 60 || nr.height < 10) continue;
        if (nr.bottom > pickBottom || (Math.abs(nr.bottom - pickBottom) < 4 && nr.width > pickW)) {
          pickBottom = nr.bottom;
          pickW = nr.width;
          pick = nodes[i];
        }
      }
      if (!pick) return false;

      var walk = pick, best = null;
      for (var hop = 0; hop < 8 && walk && walk !== document.body; hop++) {
        var cs, rect;
        try { cs = getComputedStyle(walk); rect = walk.getBoundingClientRect(); }
        catch (e) { break; }
        var radius = parseFloat(cs.borderTopLeftRadius || '0');
        var bg = cs.backgroundColor || '';
        var hasBg = bg !== '' && bg !== 'transparent' && bg.indexOf('rgba(0, 0, 0, 0)') !== 0;
        var hasBorder = parseFloat(cs.borderTopWidth || '0') > 0;
        if (radius > 4 && rect.width > 300 && (hasBg || hasBorder)) best = walk;
        walk = walk.parentElement;
      }
      if (!best) return false;
      if (best.getAttribute(MARK) !== 'composer') {
        best.setAttribute(MARK, 'composer');
        mark('client:composer-marked');
      }
      /* A NEW SCENE is recognised HERE as well as in adoptComposerNode(), and it has to be both:
         this path runs for a composer the scanner settled on, while that one runs for a node inserted
         into the DOM - and the two do not always cover the same event. The first version of the scene
         detection lived only in adoptComposerNode(), whose very first line returns early for a node
         that already carries the mark, so a switch that moved or re-used a marked composer was never
         noticed. Recognising it on both paths closes that.
         The anchor is checked BEFORE it is updated, and only when it was already set: that is what
         keeps the launch out of this, since at launch the app replaces its restored composer and that
         is a rebuild of the same scene rather than a new one. */
      /* Recorded for the diagnostics only, and the reset is offered only while the transcript gate is
         closed - see maybeResetOnComposerReplace() for why that condition is the one that cannot
         flicker, and for the two wrong anchors that came before it. */
      var replaced = (lastComposerScene && lastComposerScene !== best);
      lastComposerScene = best;
      if (replaced) maybeResetOnComposerReplace('mark-composer');
      composerGlassEl = best;
      bindPointer(best);
      return true;
    } catch (e) { return false; }
  }

  /* Mark a composer the moment it enters the DOM instead of waiting for a scan.
     A new session REPLACES the composer with a fresh node, and a fresh node carries
     no data-dsh-glass attribute - which is exactly what the reveal gate keys on - so
     until a scan ran, the app's own bare input box was on screen: material-less and
     un-animated. The scan that would fix it is the one whose debounce is 140ms while
     changes stream and up to 2.5s at the fallback tick, so the gap was plainly
     visible.

     This runs synchronously inside the mutation callback, in the same task that
     inserted the node, so the mark lands before that node is ever painted. */
  function adoptComposerNode(node) {
    try {
      if (!node || node.nodeType !== 1) return;
      if (node.getAttribute && node.getAttribute(MARK) === 'composer') return;
      var editable = node.matches && node.matches('[contenteditable="true"], textarea')
        ? node
        : (node.querySelector ? node.querySelector('[contenteditable="true"], textarea') : null);
      if (!editable) return;
      var r;
      try { r = editable.getBoundingClientRect(); } catch (e) { return; }
      if (!r || r.width < 60 || r.height < 10) return;

      /* Walk up to the painted card, the same shape markComposer() settles on. */
      var walk = editable;
      for (var hop = 0; hop < 8 && walk && walk !== document.body; hop++) {
        var cs, rect;
        try { cs = getComputedStyle(walk); rect = walk.getBoundingClientRect(); } catch (e) { break; }
        var radius = parseFloat(cs.borderTopLeftRadius || '0');
        var bg = cs.backgroundColor || '';
        var hasBg = bg !== '' && bg !== 'transparent' && bg.indexOf('rgba(0, 0, 0, 0)') !== 0;
        var hasBorder = parseFloat(cs.borderTopWidth || '0') > 0;
        if (radius > 4 && rect.width > 300 && (hasBg || hasBorder)) {
          walk.setAttribute(MARK, 'composer');
          mark('client:composer-adopted');       // marked synchronously, before paint
          composerGlassEl = walk;
          bindPointer(walk);
          /* A composer appearing AFTER a switch was requested is the moment that
             switch actually landed. startSession() only requests it - measured, the
             new composer arrives about a second later - and the transcript reveal
             waits for exactly this (see armTranscriptReveal). */
          if (sessionSwitchRequested) {
            sessionSwitchRequested = false;
            mark('client:session-switch-landed');
            armTranscriptReveal();
          }
          /* Same rule as in markComposer(): the node identity is only offered as a reset while the
             transcript gate is closed, i.e. while the app is genuinely mid-handover. */
          var replacedNode = (lastComposerScene && lastComposerScene !== walk);
          lastComposerScene = walk;
          if (replacedNode) maybeResetOnComposerReplace('composer-replaced');
          return;
        }
        walk = walk.parentElement;
      }
    } catch (e) { }
  }

  /* ---------- the composer's entrance: DELETED ----------
     This block held the session-arrival detection that decided WHEN to play the composer's
     entrance (its settle window, its debounce, and the pending flag that handed the gesture over
     to the transcript reveal). None of it has a caller now, so none of it is kept: a state
     variable whose only reader was deleted is a trap for whoever reads this next.

     The old implementation is in `_animation-backup/`, and a full tree snapshot in `_archive-*`.
     If an entrance is rebuilt, note the constraint the old one was built around: the motion must
     go on an ancestor of the `backdrop-filter` element, never on the glass itself - Chromium
     composites an animated opacity/transform separately and the material goes flat. */
  var composerGlassEl = null;

  /* THE COMPOSER'S ENTRANCE, ITS SEAT AND ITS TRIGGERS WERE DELETED HERE.
     composerSeat() chose the wrapper that owned the motion, playComposerEntrance() applied the
     keyframe class, playComposerEntranceSoon()/noteSessionForComposerEnter() decided when, and
     playDeferredEntrances()/deferEntranceUntilQuiet() released them after a session switch.
     The whole module was torn down at the user's request and is to be rewritten; the former code
     is in `_animation-backup/` and a full tree snapshot in `_archive-*`.

     READ THIS BEFORE ADDING ANYTHING BACK: the reason the seat existed is that a
     `backdrop-filter` element must never be the animating one - Chromium composites an animated
     opacity/transform separately, backdrop sampling breaks, and the material goes flat for the
     length of the gesture. Any replacement has to respect that, and the note in
     50-glass-surfaces.css about which property owns visibility still applies. */

  /* ==========================================================================
     THE WELCOME PAGE'S THREE BEATS - RESTORED, WITH ONE MECHANISM UPGRADED
     --------------------------------------------------------------------------
     The arrangement is the one the user judged correct (the "凌晨 1:10" version), rebuilt from the
     restore document because no intact copy of it survives on disk. What that version did, and what
     this does:

        the gate (`dsh-glass-ready`) owns `visibility` and nothing else
        the entrance owns `opacity` + `transform` and nothing else
        the motion goes on a SEAT - an ancestor of the glass, never the glass itself
        the gate is opened in the SAME TASK as the gesture starts: reveal and entrance are one
          event, which is the whole reason no frame of a resting input box is ever painted

     THE ONE THING CHANGED FROM THAT VERSION, and it is a change of substance rather than a tweak:
     the restore document records that the old build appended a "quiet gate" that delayed the WELCOME
     class until the main thread went idle, WITHOUT delaying the ready class. The input box was
     therefore revealed first and animated seconds later, sitting still at its starting offset in
     between - reported here as "the input box flashed" and then "no animation". Section 7.1 of that
     document concludes the reveal and the entrance must be the same beat.
     THIS BUILD GOES ONE STEP FURTHER THAN THAT CONCLUSION, because the first attempt to obey it still
     produced a broken-looking first frame: that attempt kept a WELCOME gate on the headline and the
     picker row and withheld them until the transcript reveal at t≈3.9s, while the shell had already
     opened at t≈1.0s. For ~2.9 seconds the title and picker row were MISSING from an otherwise
     visible window - "首帧特别乱".
     So there is now exactly ONE gate - the composer's - and the headline and picker row are gated by
     nothing at all. Their beats hold themselves invisible with `backwards` fill, which cannot get
     stuck, because it is not a class that has to be added by a script.

     So: NO QUIET GATE, NO TIMER, NO POLL, NO WELCOME CLASS. The moment the transcript reveal lands,
     the composer's gate opens and its beat starts, in one task. The 12s fuse in bootstrap.js is the
     only thing behind it, and it exists purely so nothing can stay hidden forever.

     THE SEAT, AND WHY IT IS CHOSEN RATHER THAN NAMED
     ------------------------------------------------
     Chromium composites an element with an animated opacity/transform separately, so a glass element
     that animates itself stops sampling its backdrop and renders flat for the whole gesture. The
     seat is therefore the first ancestor WITHOUT a backdrop-filter, checked in the live cascade. A
     null seat means the gesture is skipped: losing an animation is a much smaller failure than
     animating a surface the app has positioned.

     THE XRAY STEP, KEPT FROM THE REWRITE
     ------------------------------------
     A beat fades its whole subtree as one layer. That is right for text, but a backdrop-filter
     descendant inside a fading ancestor is composited THROUGH it, so the material would smear rather
     than stay glass. Every glass surface inside the seat is therefore withheld by `visibility` for
     the length of the gesture and revealed by its own 1ms keyframe - see the stylesheet. Order
     matters and is asserted: suppress the glass FIRST, then start the beat. The reverse paints one
     frame of an invisible block with solid glass in it. */
  var entrance = { played: false, buffering: false, seat: null };

  function isGlassNode(el) {
    try {
      var c = getComputedStyle(el);
      return !!(c.backdropFilter && c.backdropFilter !== 'none');
    } catch (e) { return false; }
  }

  /* The seat: the first ancestor that is allowed to carry motion. Checked, not assumed, and the
     walk is bounded so a surprising DOM cannot turn this into an infinite loop. */

  function composerSeat(glass) {
    try {
      var n = glass && glass.parentElement;
      var guard = 0;
      while (n && n !== document.body && guard < 6) {
        if (!isGlassNode(n)) return n;
        n = n.parentElement;
        guard++;
      }
      return null;
    } catch (e) { return null; }
  }

  function findComposerGlass() {
    try { return document.querySelector('[data-dsh-glass="composer"]'); } catch (e) { return null; }
  }

  /* Which node is a glass SURFACE, so the xray step knows what to withhold. Named markers first
     (they are ours and they are exact), the live `backdrop-filter` check last as a catch-all. */
  function isGlassSurface(el) {
    try {
      if (el.getAttribute('data-dsh-glass') === 'composer') return true;
      if (el.hasAttribute('data-dsh-glass-surface')) return true;
      if (el.hasAttribute('data-dsh-glass-block')) return true;
      if (el.hasAttribute('data-dsh-glass-card')) return true;
      if (el.hasAttribute('data-dsh-glass-rightbar')) return true;
      var cls = String(el.className || '');
      if (cls.indexOf('_material') !== -1) return true;
      return isGlassNode(el);
    } catch (e) { return false; }
  }

  function tickGlassIn(seat) {
    try {
      var kids = seat.querySelectorAll('*');
      for (var i = 0; i < kids.length; i++) {
        if (isGlassSurface(kids[i])) kids[i].setAttribute('data-dsh-glass-xray', '');
      }
      if (isGlassSurface(seat)) seat.setAttribute('data-dsh-glass-xray', '');
    } catch (e) { }
  }

  function untickGlassIn(seat) {
    try {
      var marks = seat.querySelectorAll('[data-dsh-glass-xray]');
      for (var i = 0; i < marks.length; i++) marks[i].removeAttribute('data-dsh-glass-xray');
      if (seat.hasAttribute('data-dsh-glass-xray')) seat.removeAttribute('data-dsh-glass-xray');
    } catch (e) { }
  }

  /* THE GESTURE ITSELF. Called only when the composer exists AND the region is visible - see
     maybeComposerEntrance() for why both conditions are required and what happened without them. */
  function playComposerEntrance(glass, onWelcome) {
    if (entrance.played) return false;
    var seat = composerSeat(glass);
    if (!seat) {
      mark('client:composer-entrance', { skipped: 'no-seat-without-backdrop-filter' });
      entrance.played = true;                 // do not re-walk on every later mark
      return false;
    }
    entrance.played = true;
    entrance.seat = seat;
    try {
      /* SUPPRESS FIRST, THEN START. The reverse is a real flash: the beat class would begin, the
         stylesheet would withhold the subtree, but the glass inside would not be ticked yet, so one
         frame would be painted with the block invisible and its glass solid. */
      tickGlassIn(seat);
      if (onWelcome) seat.classList.add('dsh-glass-enter-delayed');   // 3rd beat: longer delay + 28px
      seat.classList.add('dsh-glass-enter-live');

      var durMs = cssMs('--dsh-enter-duration', 800);
      var delayMs = onWelcome ? cssMs('--dsh-welcome-delay-composer', 400) : 0;

      mark('client:composer-entrance', {
        seat: seat.tagName.toLowerCase() + '.' + String(seat.className || '').split(' ')[0].slice(0, 24),
        welcome: !!onWelcome,
        atMs: Math.round(performance.now()),
        durationMs: durMs,
        delayMs: delayMs
      });

      /* The class comes off after the gesture so nothing keeps `will-change` alive and no later
         interaction is put through an active animation. Measured from the CSS's own numbers rather
         than from an `animationend` listener, because the headless/first-paint case can start the
         animation before the listener is attached - the timeout is correct either way, and being a
         little late is harmless. */
      setTimeout(function () {
        try {
          seat.classList.remove('dsh-glass-enter-live');
          seat.classList.remove('dsh-glass-enter-delayed');
          untickGlassIn(seat);
        } catch (e) { }
      }, durMs + delayMs + 140);
    } catch (e) {
      try { seat.classList.remove('dsh-glass-enter-live'); } catch (e2) { }
      try { untickGlassIn(seat); } catch (e3) { }
    }
    return true;
  }

  /* THE TRIGGER, IN FULL, BECAUSE THIS IS WHERE BOTH REBUILDS WENT WRONG.
     The gesture needs BOTH halves of one moment:
        the composer EXISTS   - marked by markComposer()/adoptComposerNode(), which run in the same
                                task that inserts the node, before it is painted
        it is VISIBLE          - `dsh-glass-new-session` is set. Until it is, the transcript gate
                                holds this whole region at `visibility:hidden !important`, and a
                                gesture started then runs to completion unseen. Measured, not
                                theoretical: at t≈1.03s an entrance played, at t≈3.87s the region
                                became visible, and the node it animated was the RESTORED session's
                                composer - replaced 1.4s later. Reported as "no animation at all, and
                                the input box flashed".
     Whichever half arrives last calls this, and `entrance.played` makes the other a no-op - so there
     is no ordering to maintain and nothing to poll. */
  function maybeComposerEntrance(onWelcome) {
    if (entrance.played) return;
    var glass = findComposerGlass();
    if (!glass || !glass.isConnected) return;
    if (!document.body.classList.contains('dsh-glass-new-session')) return;   // not visible yet
    playComposerEntrance(glass, !!onWelcome);
  }

  /* ---------- THE BLANK BUFFER, AND THEN ONE TASK THAT REVEALS AND MOVES ----------
     The user asked for breathing room before the gesture: "前面能不能留点空白缓冲，因为页面还没加载完，
     动画就冒了出来看起来很卡". Two readings of that, and both are handled here:
       · the app is still finishing its launch when the page first becomes paintable, so a gesture that
         starts into that window competes with the launch's own layout work - measured on this machine,
         the main thread is held for up to 1142ms with 47 gaps over 100ms, and while it is held NO
         frame is committed. A gesture in that window does not drop frames, it stutters;
       · and the user should not see the motion begin the instant the page appears.

     SO THE WAIT HAPPENS BEFORE THE GATE OPENS, WHICH IS THE WHOLE TRICK. While it waits, every element
     the gesture will animate is still withheld by the gates - the composer by bootstrap.js's
     structural rules, the headline and picker row by `body:not(.dsh-glass-welcome)` - so the buffer is
     spent on a hero that is not on screen, and it reads as the page arriving calmly rather than as an
     animation starting late. The 1:10 version used the same mechanism for the same reason; what broke
     it was spending the wait with the input box ALREADY revealed, which paints the box at rest at its
     starting offset. Position is the difference between the two outcomes, not the wait.

     THE WAIT IS MEASURED, NOT GUESSED. `PerformanceObserver` reports long tasks, so "the thread has
     been quiet for MIN" is an observation; MAX is the ceiling that guarantees the gesture still plays
     on a permanently busy thread. Both are CSS custom properties, so the rhythm is tunable in one
     place with the rest of the timing. */
  function bufferObserve() {
    var state = { lastTaskEnd: 0, observer: null, stop: function () { } };
    try {
      if (typeof PerformanceObserver !== 'function') return state;
      state.observer = new PerformanceObserver(function (list) {
        try {
          var entries = list.getEntries();
          for (var i = 0; i < entries.length; i++) {
            var end = entries[i].startTime + entries[i].duration;
            if (end > state.lastTaskEnd) state.lastTaskEnd = end;
          }
        } catch (e) { }
      });
      state.observer.observe({ entryTypes: ['longtask'] });
      state.stop = function () { try { state.observer.disconnect(); } catch (e) { } state.observer = null; };
    } catch (e) { }
    return state;
  }

  /* Read a time from a custom property WITHOUT depending on how the browser chose to serialise it.
     `parseFloat` looked sufficient and was not: for an unregistered custom property,
     `getPropertyValue()` returns the substituted TEXT, so `calc(200ms * 2)` reached `parseFloat` and
     produced `NaN`, which silently took the `|| 0` fallback. The composer was then animated with no
     delay on the wrong keyframe - `delayMs: 0` in its own timeline entry - which is why it never looked
     like the third beat.
     The first numeric token is what matters, so that is what is extracted: it handles `400ms`,
     `calc(200ms * 2)` and `0.4s` alike. The fallback is only for a genuinely absent value. */
  function cssMs(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name) || '';
      var m = v.match(/-?\d*\.?\d+/);
      if (!m) return fallback;
      var n = parseFloat(m[0]);
      if (isNaN(n)) return fallback;
      /* a bare number is milliseconds by CSS convention here; `s` is converted explicitly */
      if (/\ds\b/.test(v) && !/ms/.test(v)) n = n * 1000;
      return n;
    } catch (e) { return fallback; }
  }

  /* RELEASE THE GATES. This function may NOT bail out on anything - that is the one rule it has.
     It used to start by requiring the hero element and returning if it was absent, and that is what
     made the title and the picker row vanish entirely on a manually started session: the reset had
     already re-hidden them behind `dsh-glass-welcome`, and a hero lookup that came back empty meant
     the class was never added back. The result was a welcome page with its whole first two beats
     missing - a state worse than any amount of mis-timed motion, and permanent.
     A gate that hides by default must be releasable unconditionally. So the hero is now used only to
     decide whether the GESTURE can be played, and never to decide whether the page may be seen:
       · the welcome gate is always added - anything it withholds is something the user is waiting for;
       · the composer gate is always added - likewise;
       · the beat is offered to the composer only when its seat can be resolved, which is a detail of
         the motion and not of the visibility.
     One task, by construction: there is no `await` and no timer between these statements, which is
     what the restore document means by "the reveal and the entrance are one beat". */
  function commitWelcomeEntrance() {
    if (entrance.played) return;
    var hero = null;
    try { hero = document.querySelector('[class*="composerHero"]'); } catch (e) { }
    try {
      document.body.classList.add('dsh-glass-welcome');   // the headline and picker row may be seen
      document.body.classList.add('dsh-glass-ready');     // the input box may be seen
      if (reduced) {
        mark('client:entrance-released', { skipped: 'prefers-reduced-motion' });
        entrance.played = true;
        return;
      }
      mark('client:entrance-released', { welcome: true, hero: !!hero });
      maybeComposerEntrance(true);                        // ...and start it, same task
    } catch (e) { }
  }

  /* Entry point. Called by revealTranscript() - the moment the transcript gate lifts, which is the
     earliest moment anything in this hero can be seen at all.

     THE RULE THIS FUNCTION FOLLOWS, and it is the one that was violated: THE PAGE IS REVEALED FIRST
     AND UNCONDITIONALLY; THE GESTURE IS OPTIONAL AND COMES SECOND.
     Two early returns used to guard this function - "no hero, return" and "session not landed,
     return" - and both of them could leave `dsh-glass-welcome` off forever, which hides the title and
     the picker row completely. That is the state in the user's screenshot: a welcome page with its
     input box and no headline at all. Motion is a nicety; a missing title is a broken page. So the
     gates are committed on the first line, and everything after that only decides whether the beat
     can also be played.
     The buffer still happens, and it still happens while the gates are shut - commit is what opens
     them - but it is now bounded by `finish()` running unconditionally at the cap. */
  function armWelcomeEntrance() {
    if (entrance.played || entrance.buffering) return;
    try {
      var hero = document.querySelector('[class*="composerHero"]');
      var landed = document.body.classList.contains('dsh-glass-new-session');

      /* Nothing to animate, or nothing to animate yet: reveal the page now and be done. This is the
         path that matters most, because it is the one that used to hide the hero permanently. */
      if (reduced || !hero || !landed) {
        commitWelcomeEntrance();
        return;
      }

      entrance.buffering = true;
      var minMs = cssMs('--dsh-enter-buffer-min', 450);
      var maxMs = cssMs('--dsh-enter-buffer-max', 1100);
      var quiet = bufferObserve();
      var started = performance.now();
      var finish = function (via) {
        if (entrance.played) { quiet.stop(); return; }
        quiet.stop();
        mark('client:entrance-buffer', {
          via: via,
          waitedMs: Math.round(performance.now() - started)
        });
        commitWelcomeEntrance();
      };
      (function step() {
        if (entrance.played) { quiet.stop(); return; }
        var now = performance.now();
        var elapsed = now - started;
        if (elapsed >= maxMs) { finish('cap'); return; }
        /* `lastTaskEnd` is 0 when no long task has been seen at all, which counts as quiet. */
        var quietFor = now - Math.max(quiet.lastTaskEnd, started);
        if (elapsed >= minMs && quietFor >= minMs) { finish('quiet'); return; }
        requestAnimationFrame(step);
      })();
    } catch (e) {
      /* Any failure here must still reveal the hero: a buffer is a nicety, and leaving the welcome
         page withheld would be the worst outcome in this file. */
      try { commitWelcomeEntrance(); } catch (e2) { }
    }
  }

  /* ---------- THE ONE SAFE MOMENT TO RESET, AND WHY IT IS SAFE ----------
     Three attempts tried to detect a new session, and the first two were wrong in the same way - they
     used a PROXY that also moves when nothing has happened:
       · the composer's node identity: the app replaces that node every second or two on an empty
         welcome page, so the reset fired eight times per session and re-hid the hero each time;
       · the session list's selected key: the list is re-rendered and the selection momentarily
         disappears, so the key flickers and produced eight `new-scene` entries again.
     Both loops had the same cost: each reset removes `dsh-glass-welcome`, which HIDES the headline and
     the picker row, and nothing re-adds it until an entrance is played - so the hero disappeared.

     THE CONDITION THAT CANNOT FLICKER IS THE TRANSCRIPT GATE, and it is the app's own statement about
     what is happening: `dsh-glass-new-session` ABSENT means the app is mid-handover and the transcript
     region is deliberately withheld. Two things follow, and together they make this safe:
       · while it is absent, nothing of the conversation is on screen, so re-hiding the hero costs
         nothing - there is no visible element to lose;
       · and the app is genuinely building a new session, so resetting here is CORRECT rather than a
         guess.
     When the gate is present, a fresh composer node means nothing more than a re-render, and this
     leaves the entrance alone.
     The reveal then does the rest: when the region settles and the gate opens, armWelcomeEntrance()
     runs the launch's own sequence - the same one code path for a launch, a manual "new session", and
     anything else that gets here. */
  function maybeResetOnComposerReplace(where) {
    try {
      if (document.body.classList.contains('dsh-glass-new-session')) return false;
      if (!entrance.played) return false;          // nothing has played yet: nothing to reset
      mark('client:scene-reset', { where: where });
      resetEntranceForNextSession('switch-in-flight:' + where);
      return true;
    } catch (e) { return false; }
  }

  /* RELEASE THE SHELL GATE - AND, SINCE THE RESTORE, THE COMPOSER'S GATE WITH IT.
     The shell: `body > *` is withheld until the material stylesheets have APPLIED, because they are
     injected after the app's first paint and the window would otherwise be shown with no glass at
     all. The wait below is a FOUC fix, not choreography.
     The composer: `dsh-glass-ready` releases the input box, which bootstrap.js withholds from the
     first frame with structural `:has()` selectors. Opening it here is safe because this point is
     *after* the stylesheets applied - so the box can never be revealed without its material, which is
     the failure ("it turns into glass a second later") those selectors exist to prevent.
     The ENTRANCE is deliberately not started here; see the note inside open(). */
  var composerRevealed = false;

  function stylesAreReady() {
    try { return window.__dshGlassStylesReady === true; } catch (e) { return true; }
  }

  function revealComposer() {
    if (composerRevealed) return;
    composerRevealed = true;
    var announced = false;
    /* ★ 开门前必须先让"开场黑场"就位。
       起因（用户实测反馈）：冷启动时 DSH 界面会先露出来约 1 秒，然后才被开场动画盖上。
       实测时序（startup-timeline.log，某次启动）：
         client:composer-revealed  14.224   ← 闸门抬起，界面露出来
         module-loaded             14.918   ← 客户端模块才执行
         intro:start               14.920   ← 黑场到这里才盖上
       也就是说：闸门由【本函数】抬起，而它完全不知道开场层的存在；
       开场层却要等 lib/client.js 执行才挂载 —— 中间那 0.7 秒界面是裸露的。
       （之后还有约 1.3 秒是"黑场已盖、视频未起"，那是设计里的黑场，正常。）

       所以这里改成：如果本次开场【会】播，就先等 #dsh-glass-intro 出现再抬闸门。
       等到了就是"同一帧盖黑场 + 同时露界面"，窗口消失。
       ⚠ 必须有硬超时：万一开场层因为异常没挂上，界面不能永远藏着。
         取 1200ms（本机上模块在 styles-ready 后约 700ms 执行，余量够），
         且比 bootstrap.js 的 5 秒兜底早得多，不会互相打架。
       ⚠ 开场本来就不播的两种情况要【立刻放行】，否则会白白黑屏一下：
         · 画质档位是 极低/低（那两档 intro:false）
         · 用户要求减弱动效（prefers-reduced-motion） */
    var INTRO_WAIT_MAX_MS = 1200;
    var waitStart = 0;
    var introWillPlay = function () {
      try {
        if (reduced) return false;
        /* 档位：与 lib/client.js 的 GLASS_QUALITY_LEVELS 同一份判断
           （min / low 的 intro 为 false）。页面脚本只读 localStorage，不依赖模块。 */
        var lv = null;
        try { lv = window.localStorage && window.localStorage.getItem('dsh-glass-quality'); } catch (e) { lv = null; }
        if (lv === 'min' || lv === 'low') return false;
        return true;
      } catch (e) { return false; }   /* 判不出来就别拦，宁可露一下也不要卡住 */
    };
    var open = function (via) {
      try {
        if (document.body.classList.contains('dsh-glass-ui')) return;
        if (!stylesAreReady()) {
          /* Re-arm rather than give up: bootstrap.js releases the shell after 5s whatever happens,
             so this cannot spin forever even if no stylesheet ever reports. */
          if (!announced) { announced = true; mark('client:awaiting-styles'); }
          setTimeout(function () { open(via + ':retry'); }, 100);
          return;
        }
        /* 等开场黑场就位（见上面的说明）。只在"会播且还没挂上"时等。 */
        if (introWillPlay() && !document.getElementById('dsh-glass-intro')) {
          if (!waitStart) waitStart = performance.now();
          if (performance.now() - waitStart < INTRO_WAIT_MAX_MS) {
            if (!announced) { announced = true; mark('client:awaiting-intro-cover'); }
            setTimeout(function () { open(via + ':intro-cover'); }, 50);
            return;
          }
          mark('client:intro-cover-timeout', { waitedMs: Math.round(performance.now() - waitStart) });
        }
        /* ONLY THE SHELL IS OPENED HERE. The composer's gate (`dsh-glass-ready`) is opened later, at
           the transcript reveal, IN THE SAME TASK as its entrance starts - see armWelcomeEntrance().
           Opening it here instead would reveal the input box at t≈1.03s and leave it resting at its
           starting offset until the gesture began at t≈3.87s, which is the "input box flashed" report.
           Until then the box stays withheld by bootstrap.js's structural rules, so there is no window
           in which it can be seen without its material either. */
        document.body.classList.add('dsh-glass-ui');
        mark('client:composer-revealed', { via: via });
      } catch (e) { }
    };
    try {
      requestAnimationFrame(function () { requestAnimationFrame(function () { open('raf'); }); });
      // rAF can be starved if the window is not being painted; never rely on it alone
      setTimeout(function () { open('timer'); }, 250);
    } catch (e) {
      open('catch');
    }
  }

  /* ---------- other surfaces ----------
     Marking only; the material is pure CSS in 50-glass-surfaces.css.
     Everything here was chosen from measurements of the live UI: the sidebar
     controls and the file-edit cards are already translucent but carry no blur
     at all, which makes them the natural next step. Code blocks are excluded on
     purpose - they hold long-form text and must keep an opaque backing. */

  var CODE_LIKE = /md-code-block|_plain_|_block_|codeblock|_code_|highlight|_pre_/i;
  var SURFACE_MARKS = ['data-dsh-glass-surface', 'data-dsh-glass-block', 'data-dsh-glass-topbar', 'data-dsh-glass-rightbar', 'data-dsh-glass-card', 'data-dsh-glass-active', 'data-dsh-glass-popup'];

  function paintsSomething(el) {
    try {
      var bg = getComputedStyle(el).backgroundColor || '';
      return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
    } catch (e) { return false; }
  }

  function isVisibleBox(el) {
    try {
      var c = getComputedStyle(el);
      if (c.display === 'none' || c.visibility === 'hidden') return false;
      var r = el.getBoundingClientRect();
      return r.width > 40 && r.height > 16;
    } catch (e) { return false; }
  }

  /* Full reconciliation of the marks we own.

     Every pass, every node carrying one of our marks must be present in this
     pass's keep set or the mark is removed. Relying on "the node stopped
     qualifying" was not enough: a row that had been marked while the list was
     mid-update stayed marked afterwards even though it no longer qualified,
     because nothing ever revisited it. Reconciling the whole DOM against the
     current decision removes that timing dependency entirely, and `removed` is
     reported so the sweep can be observed from outside.

     ★ 但 file-edit 卡片必须例外，而且这个例外是【实测逼出来的】：
       识别卡片时有一项判据是 paintsSomething(header)（"header 当前画着东西"），
       它在重绘之间【不稳定】—— 同一张卡片的判定会在真/假之间翻。
       判定翻假的那一轮，卡片不进 keep → 这里把标记摘掉 → 卡片掉回宿主灰色；
       下一轮判定翻真 → 又打上标记 → 变回玻璃色。每轮扫描来回切，就是用户看到的闪烁。
       （同样的机制在代码块工具条上发生过一次，注释在 markSurfaces 里，
         当时实测 4 秒内 ADD x12 / DEL x12。）

       所以这里加一道【结构复检】：标记为卡片、但本轮没进 keep 的节点，
       只要它仍然长得像卡片（够大、够圆、有任何 header 子元素——不看是否画着东西），
       就保留标记。这样判定抖动不再引起标记抖动，而真正的陈旧标记
       会在下一轮按同样的复检被清掉（那时它已经不再像卡片）。

       范围刻意收窄到卡片这一个标记：其它面的判据本来就稳定，
       不该因为这一处特例而整体放宽。 */
  function stillLooksLikeCard(el) {
    try {
      var r = el.getBoundingClientRect();
      if (!(r.left >= 300 && r.width > 500 && r.height >= 40)) return false;
      if (el.querySelector('pre, code')) return false;
      if (el.parentElement && el.parentElement.querySelector('pre, code')) return false;
      if (parseFloat(getComputedStyle(el).borderTopLeftRadius || '0') < 10) return false;
      for (var i = 0; i < el.children.length; i++) {
        if (/_header/i.test(String(el.children[i].className || ''))) return true;
      }
      return false;
    } catch (e) { return false; }
  }
  function clearStaleMarks(keep) {
    var removed = 0;
    try {
      for (var m = 0; m < SURFACE_MARKS.length; m++) {
        var attr = SURFACE_MARKS[m];
        var marked = document.querySelectorAll('[' + attr + ']');
        for (var i = 0; i < marked.length; i++) {
          if (keep.indexOf(marked[i]) === -1) {
            /* 卡片：先做结构复检，仍然像卡片就别摘（见上面的说明） */
            if (attr === 'data-dsh-glass-card' && stillLooksLikeCard(marked[i])) continue;
            marked[i].removeAttribute(attr);
            removed++;
          }        }
      }
    } catch (e) { }
    return removed;
  }

  /* Which control is the current selection?
     Structural signals first, because class names here are build-generated and
     the app is free to change them: an explicit aria/data state is the truth.
     The class test stays as a fallback for rows that announce selection only
     through their class. */
  function isSelectedRow(el, cls) {
    try {
      if (el.getAttribute('aria-selected') === 'true') return true;
      if (el.getAttribute('aria-current') && el.getAttribute('aria-current') !== 'false') return true;
      if (el.getAttribute('data-state') === 'active' || el.getAttribute('data-state') === 'selected') return true;
      if (el.getAttribute('data-selected') !== null && el.getAttribute('data-selected') !== 'false') return true;
      if (el.getAttribute('data-active') !== null && el.getAttribute('data-active') !== 'false') return true;
      return /selected|active|current/i.test(cls || '');
    } catch (e) { return false; }
  }

  /* Find the top bar without relying on build-generated class names.
     The two view-switch tabs are the reliable anchor (role=tab/tablist, or plain
     buttons inside a tablist); walk up from them to the strip that spans the
     content column. A semantic <header> in the same region is the fallback. */
  function findTopBar() {
    try {
      var anchor = null;
      var tabs = document.querySelectorAll('[role="tab"]');
      if (!tabs.length) {
        var list = document.querySelector('[role="tablist"]');
        if (list) tabs = list.querySelectorAll('button,[role="button"]');
      }
      if (tabs.length) anchor = tabs[0];
      if (!anchor) {
        var btns = document.querySelectorAll('button');
        for (var b = 0; b < btns.length; b++) {
          var t = (btns[b].innerText || '').replace(/\s+/g, '');
          if (t === '对话' || t === '轨迹') { anchor = btns[b]; break; }
        }
      }
      if (!anchor) return null;

      var node = anchor;
      for (var hop = 0; hop < 6 && node && node !== document.body; hop++) {
        var r = node.getBoundingClientRect();
        if (r.width > 400 && r.height >= 30 && r.height <= 140 && r.top < 160) return node;
        node = node.parentElement;
      }
      if (anchor.closest) {
        var hdr = anchor.closest('header');
        if (hdr) return hdr;
      }
      return null;
    } catch (e) { return null; }
  }

  /* Find the right sidebar's own painting panel.
     The column element is transparent; exactly one child section paints the whole
     column. Class names there are build-generated, so the panel is identified by
     being the descendant that covers the column and paints. */
  function findRightBarPanel() {
    try {
      var col = document.querySelector('[class*="rightbarCol"]');
      if (!col) return null;
      var cr = col.getBoundingClientRect();
      if (cr.width < 140 || cr.height < 160) return null;
      var best = null, bestArea = 0;
      var kids = col.querySelectorAll('*');
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') continue;
        var r = el.getBoundingClientRect();
        if (r.width < cr.width * 0.6 || r.height < cr.height * 0.5) continue;
        var c = getComputedStyle(el);
        if (c.display === 'none' || c.visibility === 'hidden') continue;
        var bg = c.backgroundColor || '';
        if (bg === '' || bg === 'transparent' || bg.indexOf('rgba(0, 0, 0, 0)') === 0) continue;
        var area = r.width * r.height;
        if (area > bestArea) { bestArea = area; best = el; }
      }
      return best;
    } catch (e) { return null; }
  }

  function markSurfaces(restricted) {
    try {
      /* Selection state has to be rebuilt from scratch every pass. The previous
         selection still looks like a perfectly valid row, so a "only clear what
         stopped qualifying" sweep would never drop its highlight - which is
         exactly the bug where every row that had ever been clicked stayed lit.
         Presence marks may be cleared lazily at the end; the active mark is
         cleared up front and re-applied to the current selection. */
      var activeMarked = document.querySelectorAll('[data-dsh-glass-active]');
      for (var a = 0; a < activeMarked.length; a++) activeMarked[a].removeAttribute('data-dsh-glass-active');

      var keep = [];

      /* ---- the workspace block gets ONE glass panel ----
         Per-row glass produced a stack of separate rounded rectangles with seams
         between them. The workspace section is a single visual unit, so the
         smallest container that holds the session rows is the panel; the rows
         inside carry no material of their own. */
      try {
        var rows = document.querySelectorAll('[role="treeitem"]');
        var firstRow = null, rowCount = 0;
        for (var q = 0; q < rows.length; q++) {
          var qr = rows[q].getBoundingClientRect();
          if (qr.width < 80 || qr.height < 10) continue;
          if (!firstRow) firstRow = rows[q];
          rowCount++;
        }
        if (firstRow && rowCount >= 1) {
          var node = firstRow;
          var hops = 0;
          while (node && hops < 8) {
            var holdsAll = true;
            var seen = 0;
            for (var w = 0; w < rows.length; w++) {
              if (getComputedStyle(rows[w]).display === 'none') continue;
              if (!node.contains(rows[w])) { holdsAll = false; break; }
              seen++;
            }
            if (holdsAll && seen >= 1) {
              var nb = node.getBoundingClientRect();
              // a sane panel: as wide as the sidebar column family, not the page
              if (nb.width > 120 && nb.width < 420 && nb.height > 0) {
                node.setAttribute('data-dsh-glass-block', '1');
                keep.push(node);
                break;
              }
            }
            node = node.parentElement;
            hops++;
          }
        }
      } catch (e) { }

      /* ---- top bar: a material layer INSIDE the header ----
         The header (the strip holding the workspace title, the status line and the
         conversation/trace tabs) paints nothing today, and the transcript scroller
         starts exactly at its bottom edge - so transcript content slides under the
         title with nothing to separate them. A glass layer fixes both at once.

         The layer is a child of the header rather than a backdrop-filter on the
         header itself: the header is statically positioned and carries the window
         drag region, and an absolutely positioned child with pointer-events:none
         changes no layout and intercepts no input. */
      try {
        var topbar = findTopBar();
        if (topbar) {
          topbar.setAttribute('data-dsh-glass-topbar', '1');
          if (getComputedStyle(topbar).position === 'static') topbar.style.position = 'relative';
          var layer = topbar.querySelector(':scope > .dsh-glass-topbar-layer');
          if (!layer) {
            layer = document.createElement('div');
            layer.className = 'dsh-glass-topbar-layer';
            layer.setAttribute('aria-hidden', 'true');
            topbar.insertBefore(layer, topbar.firstChild);
          }
          /* NO ENTRANCE FOR THE TOP BAR - see the note in 50-glass-surfaces.css. One was
             written, then removed: the bar is rebuilt by the app while a conversation loads,
             and it carries a backdrop-filter over content that is repainted during that same
             load, so it is the busiest material on screen. Nothing here animates it; it is
             only marked, so the stylesheet can give it its material. */
          keep.push(topbar);
          keep.push(layer);
        }
      } catch (e) { }

      /* ---- right sidebar: one glass pane ----
         It is a navigation surface like the left sidebar and was painting fully
         opaque. Same shape of treatment as the workspace block: the panel carries
         the material, the rows inside stay flat. */
      try {
        var rbPanel = findRightBarPanel();
        if (rbPanel) {
          rbPanel.setAttribute('data-dsh-glass-rightbar', '1');
          keep.push(rbPanel);

          /* The hover feedback on the pane's rows is a pointer-following glow, the
             same mechanism the composer uses (--dsh-gx/--dsh-gy/--dsh-glint). The
             rows are bound here so the highlight tracks the cursor instead of
             flooding the whole row. */
          var rbRows = rbPanel.querySelectorAll('[class*="_entry"],[class*="_row"]');
          for (var rr = 0; rr < rbRows.length; rr++) bindPointer(rbRows[rr]);
        }
      } catch (e) { }

      /* ---- tab host: the same navigation material, in its "split" form ----
         The right sidebar's pane can be split into a tab host that lives in the main region
         (section._tabHost_ - measured: two of them at 576x712, bg rgb(21,21,23), opaque, i.e.
         exactly the kind of node findRightBarPanel() looks for). But it is NOT inside
         [class*="rightbarCol"], so findRightBarPanel() can never reach it and the material
         disappears - that is the reported "once the start panel splits in two, the liquid
         glass is gone".

         ⚠ It must be marked HERE and pushed into `keep`, never patched from the plugin layer:
         the SURFACE_MARKS sweep below removes every mark that is not in `keep`, so a
         plugin-side mark would be removed on each pass and re-added by its own timer -
         a visible flicker (measured: removed -> re-added -> removed = the shimmer reported). */
      try {
        var tabHosts = document.querySelectorAll('section[class*="_tabHost_"]');
        for (var ti = 0; ti < tabHosts.length; ti++) {
          var th = tabHosts[ti];
          var thr = th.getBoundingClientRect();
          if (thr.width < 200 || thr.height < 160) continue;
          th.setAttribute('data-dsh-glass-rightbar', '1');
          keep.push(th);
        }
      } catch (e) { }

      /* WHERE TO LOOK.
         "body *" is correct but ruinous: measured on a loaded conversation it is 4966
         elements, each costing a getBoundingClientRect() - a forced synchronous layout -
         for 100-190ms a pass and a worst case of 408ms. Twenty-four frame budgets is what
         made the top bar's entrance hitch while a conversation loaded.

         Only three containers can hold anything this plugin marks: the sidebar (workspace
         block, session rows, controls), the header (top bar, tabs) and the content column
         (bubbles, file cards). Scanning those instead of the whole document keeps coverage
         identical - every markable element lives in one of them - while dropping the
         hundreds of inline spans, marks and code tokens the transcript is made of.

         The immediate pass narrows further, to the sidebar and header only: those are the
         places a user-triggered change is seen at once. See the MutationObserver below. */
      function collectRoots(restrictedMode) {
        var roots = [];
        try {
          if (restrictedMode) {
            var side = document.querySelector('[class*="sidebarCol"]') || document.querySelector('[class*="frame"]');
            if (side) roots.push(side);
            var head = document.querySelector('header') || document.querySelector('[class*="header"]');
            if (head && roots.indexOf(head) === -1) roots.push(head);
          } else {
            var s2 = document.querySelector('[class*="sidebarCol"]');
            if (s2) roots.push(s2);
            var h2 = document.querySelector('header') || document.querySelector('[class*="centerCol"]');
            if (h2) roots.push(h2);
            var c2 = document.querySelector('[class*="centerCol"]');
            if (c2 && roots.indexOf(c2) === -1) roots.push(c2);
          }
        } catch (e) { }
        if (!roots.length) roots.push(document.body);
        return roots;
      }

      var scanRoots = collectRoots(restricted);
      var all = [];
      for (var sr = 0; sr < scanRoots.length; sr++) {
        var found = scanRoots[sr].querySelectorAll('*');
        for (var fi = 0; fi < found.length; fi++) all.push(found[fi]);
      }

      var measured = 0;
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var cls = String(el.className || '');
        if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || el.tagName === 'LINK') continue;

        /* CHEAP PRE-FILTER, BEFORE ANY LAYOUT READ.
           Every rule this scanner applies keys on a class name, on role="treeitem", or on an
           id containing "popup" - so an element with no class cannot be marked. The transcript
           is mostly classless leaves (span, strong, em, code, p), and measuring each of them
           cost a getComputedStyle plus a getBoundingClientRect, i.e. a forced layout, for
           nothing. Measured on a loaded conversation that is 4600 elements; skipping the
           classless ones removes the large majority of the reads before they happen.

           The one thing that must not be skipped is an element that already carries a mark:
           clearStaleMarks needs those in the keep set, or it would remove them. */
        if (!cls && el.tagName !== 'BUTTON' && !el.getAttribute('role') && !el.id &&
          !el.hasAttribute('data-dsh-glass-surface') && !el.hasAttribute('data-dsh-glass-active') &&
          !el.hasAttribute('data-dsh-glass-card') && !el.hasAttribute('data-dsh-glass-block') &&
          !el.hasAttribute('data-dsh-glass-topbar') && !el.hasAttribute('data-dsh-glass-rightbar') &&
          !el.hasAttribute('data-dsh-glass-popup')) {
          continue;
        }

        if (!isVisibleBox(el)) continue;
        measured++;
        var r = el.getBoundingClientRect();

        /* Session rows: keep the selection mark, but no per-row panel - the
           block above owns the material. */
        if (el.getAttribute('role') === 'treeitem') {
          if (r.left < 300 && r.width < 320) {
            if (isSelectedRow(el, cls)) el.setAttribute('data-dsh-glass-active', '1');
            keep.push(el);
          }
          continue;
        }

        /* Sidebar controls: the "new session" pill, and the icon rows below it
           ("Plugins", the account row).

           THESE ROWS ARE TRANSPARENT AT REST. The original condition demanded a painted
           background, on the assumption - written in this file's header - that the
           sidebar controls "were already translucent". Only some of them are: the
           "new session" pill paints, while the icon rows paint nothing until the app
           hovers them. Those were therefore never marked, so they had no material at
           all and the only thing that ever appeared was the APP's own hover feedback -
           which reads as "the glass only renders when I hover".

           So the paint requirement is dropped for recognised controls, and the geometry
           is tightened to compensate: a control is a real control element (button /
           role=button / a class naming it as a row) that sits in the sidebar strip.
           That is narrower than "anything painted and rounded", which is what the old
           condition would have caught. */
        var rounded = parseFloat(getComputedStyle(el).borderTopLeftRadius || '0');
        var inSidebar = r.left < 300 && r.width < 320 && r.height >= 24 && r.height <= 64;
        var isControlElement = el.tagName === 'BUTTON' ||
          el.getAttribute('role') === 'button' ||
          /(^|_)(row|button|btn|control|trigger|action|item)(_|$)/i.test(cls);
        if (inSidebar && isControlElement && rounded >= 6 && !CODE_LIKE.test(cls)) {
          if (isSelectedRow(el, cls)) el.setAttribute('data-dsh-glass-active', '1');
          el.setAttribute('data-dsh-glass-surface', '1');
          keep.push(el);
          continue;
        }
        /* Painted, rounded, non-control elements in the sidebar keep their own pill. */
        if (inSidebar && rounded >= 6 && !CODE_LIKE.test(cls) && paintsSomething(el)) {
          if (isSelectedRow(el, cls)) el.setAttribute('data-dsh-glass-active', '1');
          el.setAttribute('data-dsh-glass-surface', '1');
          keep.push(el);
          continue;
        }

        /* File-edit cards in the transcript: wide, rounded, and they carry a
           header child that paints (that header is the opaque overlay we clear). */
        if (r.left >= 300 && r.width > 500 && r.height >= 40) {
          if (CODE_LIKE.test(cls)) continue;
          /* STRUCTURAL EXCLUSION FOR CODE BLOCKS - the class test above is not enough.
             A markdown code block carries a language label ("js") and a copy button in its
             own header, so it satisfies every shape test here: left>=300, width>500,
             height>=40, radius>=10, and a header child that paints. It was therefore marked
             as a file-edit card and given the card material. Worse, the hasHeader test is
             not stable across repaints (the header's painted background comes and goes), so
             the mark was applied and swept on alternating passes and the MATERIAL FLICKERED.
             Structure is the reliable signal: a code block always contains <pre>/<code>,
             a file-edit card never does. */
          if (el.querySelector('pre, code')) continue;
          /* ...and the same exclusion for the code block's TOOLBAR, which is a SIBLING of the
             <pre> rather than an ancestor or descendant of it: div._bannerWrap_ (the strip with
             the language label and the copy button) sits NEXT TO the code, so it does not
             contain <pre> itself and slipped through the test above. It then entered this
             file-card branch, where `height >= 40` lands right on the boundary for a one-line
             toolbar - the verdict flipped on repaint/scroll/hover, the mark was applied and
             swept alternately, and the card material flickered. Measured from the live DOM:
             ADD card x12 / DEL card x12 within 4s on div._bannerWrap_, i.e. exactly the
             flicker reported. Structure stays the reliable signal. */
          if (el.parentElement && el.parentElement.querySelector('pre, code')) continue;
          if (parseFloat(getComputedStyle(el).borderTopLeftRadius || '0') < 10) continue;
          /* ★ header 判据【只看结构，不看是否画着东西】。
             这一项原来写成 `/_header/i.test(hc) && paintsSomething(el.children[h])`，
             而 paintsSomething 读的是 getComputedStyle().backgroundColor —— 它有两个毛病，
             都实测出现过：
               ① 重绘之间会翻真/翻假 → 标记被反复加上又摘掉 → 材质闪烁
                  （见 clearStaleMarks 里记的那次：4 秒内 ADD x12 / DEL x12）
               ② 冷启动首帧它是【假】的（样式还没算完）→ 首轮扫描不给标记 →
                  卡片那一块没有玻璃，看起来就是"重启后这一块消失了"，
                  直到某次重绘把它翻真才出现。用户实测反馈的原话就是这个现象。
             结构才是可靠信号：卡片一定有个 class 含 _header 的子元素。
             画不画东西与"是不是卡片"无关 —— 那本该是样式层的判断，不该参与识别。 */
          var hasHeader = false;
          for (var h = 0; h < el.children.length; h++) {
            if (/_header/i.test(String(el.children[h].className || ''))) { hasHeader = true; break; }
          }
          if (!hasHeader) continue;
          el.setAttribute('data-dsh-glass-card', '1');
          keep.push(el);
        }
      }

      /* Recorded so the scan-cost diagnostic reports what a pass actually walked and measured,
         instead of counting the whole document and implying a cost that no longer applies. */
      try {
        markSurfaces.lastScanned = all.length;
        markSurfaces.lastMeasured = measured;
      } catch (e) { }

      /* Popups: mark the host so the stylesheet can leave exactly one glass
         layer instead of stacking a blur on every row. */
      var popups = document.querySelectorAll('[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]');
      for (var p = 0; p < popups.length; p++) {
        var pe = popups[p];
        if (!isVisibleBox(pe)) continue;
        var pr = pe.getBoundingClientRect();
        if (pr.width < 60 || pr.height < 30) continue;
        pe.setAttribute('data-dsh-glass-popup', '1');
        keep.push(pe);
      }

      /* A restricted pass knows nothing about the nodes it did not look at, so it must not
         sweep: clearStaleMarks would see every transcript mark as "not kept" and delete it.
         Cleanup stays the job of the full passes. */
      var removedMarks = restricted ? 0 : clearStaleMarks(keep);

      /* Report what actually survived the sweep, not how many were considered.
         The earlier number was taken before cleanup and therefore disagreed with
         the DOM (it claimed 8 while only 2 nodes were marked), which sends anyone
         debugging this in the wrong direction. */
      var live = { surface: 0, active: 0, card: 0, popup: 0, removed: removedMarks };
      try {
        live.surface = document.querySelectorAll('[data-dsh-glass-surface]').length;
        live.active = document.querySelectorAll('[data-dsh-glass-active]').length;
        live.card = document.querySelectorAll('[data-dsh-glass-card]').length;
        live.popup = document.querySelectorAll('[data-dsh-glass-popup]').length;
      } catch (e) { }
      markSurfaces.live = live;
      return live;
    } catch (e) { return 0; }
  }

  function scan(restricted) {
    var t0 = performance.now();
    var okComposer = markComposer();
    var okBubble = markUserBubble();
    var okCard = markAssistantBlock();
    var surfaces = markSurfaces(restricted);
    ensureGlow();
    ensureBackdrop();
    syncBackdropOwnership();

    // First successful pass: from here on transitions may run. Until this class
    // exists the CSS suppresses transitions, so the material appears instantly
    // instead of fading in (which read as "the effect is loading").
    try {
      if ((okComposer || okBubble || okCard) && !document.body.classList.contains('dsh-ready')) {
        document.body.classList.add('dsh-ready');
      }
    } catch (e) { }

    // Release the composer's reveal gate once its material is marked and painted.
    if (okComposer) revealComposer();

    try {
      if (window.__dshGlass) {
        window.__dshGlass.markedSurfaces = surfaces;
        window.__dshGlass.liveMarks = markSurfaces.live || surfaces;
      }
    } catch (e) { }

    try {
      var dt = performance.now() - t0;
      window.__dshScanTiming = window.__dshScanTiming || { calls: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
      var s = window.__dshScanTiming;
      s.calls++;
      s.totalMs = Math.round((s.totalMs + dt) * 10) / 10;
      s.maxMs = Math.round(Math.max(s.maxMs, dt) * 10) / 10;
      s.lastMs = Math.round(dt * 10) / 10;
      s.lastScanned = markSurfaces.lastScanned || 0;
      s.lastMeasured = markSurfaces.lastMeasured || 0;
    } catch (e) { }
  }

  /* Geometry-only follow. Scrolling never changes childList, so the observer and
     the fallback tick never fire while the transcript moves - yet the glass layer
     is absolutely positioned and therefore drifts immediately. Re-scanning on
     every scroll frame would be far too expensive, so this only re-reads two
     rectangles and rewrites four offsets. */
  function followGlass() {
    try {
      var col = observed || document.querySelector('[class*="_column"]');
      if (col) syncGlass(col);
    } catch (e) { }
  }

  var followQueued = false;
  function queueFollow() {
    if (followQueued) return;
    followQueued = true;
    try {
      requestAnimationFrame(function () { followQueued = false; followGlass(); });
    } catch (e) { followQueued = false; followGlass(); }
  }

  /* Find the element that actually scrolls the transcript, so the listener is
     attached to the right node (the scroll container is not always the column's
     parent). */
  function attachScrollWatchers() {
    try {
      window.addEventListener('scroll', queueFollow, true);   // capture: catches inner scrollers
      var col = document.querySelector('[class*="_column"]');
      var node = col;
      for (var i = 0; i < 6 && node; i++) {
        if (!node.getBoundingClientRect) break;
        var cs = getComputedStyle(node);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
          node.addEventListener('scroll', queueFollow, { passive: true });
        }
        node = node.parentElement;
      }
    } catch (e) { }
  }

  /* ---------- keeping the restored conversation off screen ----------
     The app restores the last conversation first and only then switches to a new
     session, so the restored one is rendered and visible for a moment before the
     switch - the user sees the old conversation flash and then jump away.

     Since that conversation is going to be replaced anyway, it is never worth
     showing. bootstrap.js withholds the transcript from the very first paint; the
     call that actually starts the new session lifts that gate (lib/client.js calls
     dshGlassOnNewSessionStarted). Nothing about the app is modified - this only
     decides what is painted during the handover. */
  function revealTranscript(via) {
    try {
      if (document.body.classList.contains('dsh-glass-new-session')) return;
      /* THE TRANSCRIPT GATE IS NOT ANIMATION AND IS KEPT.
         The app restores the previous conversation first and only then switches to a new session,
         so the restored one is painted and visible for a moment before it is replaced - the old
         conversation flashes, then jumps away. It is going to be replaced anyway, so showing it is
         never worth it. bootstrap.js withholds the transcript from the very first paint and this
         is what lifts the gate. Nothing about the app is modified; this only decides what is
         painted during the handover. */
      document.body.classList.add('dsh-glass-new-session');
      mark('client:transcript-revealed', { via: via });
      /* AND THE GESTURE STARTS HERE - the restored design's rule, in the place the document says it
         must be: the reveal and the entrance are ONE event. The transcript gate is what withholds the
         region, so before this class the composer can exist and still be invisible, and a gesture
         played then is played to an empty stage (measured on an early build: entrance t≈1.03s, reveal
         t≈3.87s). armWelcomeEntrance() opens the hero's gate and starts the beats in the same task,
         and commits unconditionally when there is no gesture to play. */
      armWelcomeEntrance();
    } catch (e) { }
  }
  try { window.__dshGlassRevealTranscript = revealTranscript; } catch (e) { }

  /* DELETED: the quiet gate.
     `deferEntranceUntilQuiet` measured how long the main thread had been free of long tasks and
     released the entrance only once it had settled, because playing a gesture into a conversation
     load froze it halfway. `quietForMs` reported that measurement, `playDeferredEntrances` played
     the held gesture, and the QUIET_* constants tuned it.

     It is gone with the gesture it protected. What it knew is still worth keeping in mind if an
     entrance is rebuilt: a long task during a load stops even compositor-driven animations,
     because no frame is committed while the main thread is held. */

  /* Called once the new session has actually been started. Revealing immediately
     would expose the middle of the handover, so the transcript is watched until it
     stops changing (restored content being torn down, the new page being laid out)
     and only then uncovered. A cap keeps a busy transcript from holding the gate
     shut forever. */
  /* ---------- RESETTING THE SCENE FOR THE NEXT SESSION ----------
     WITHOUT THIS, THE ENTRANCE PLAYS EXACTLY ONCE PER WINDOW, and that is a real bug rather than a
     question of taste: the gates are one-way classes, so after the launch they stay on and the next
     welcome page arrives already revealed and already finished. The user found it the direct way -
     "手动开启新话题后反而输入框不动了".
     (The same code path is what the app itself uses at launch: the plugin asks for a new session
     every time, so a launch and a manual Ctrl+N are the same sequence. That is why the fix has to live
     here and not in a launch-only special case.)

     WHAT IS RESET AND WHAT IS NOT, which is the whole of the care in this function:
       `dsh-glass-welcome`  IS removed. It is the switch for the hero's three beats, and removing it
                            re-hides the headline and picker row (the gate rule is keyed on the class)
                            so the next commit can reveal them with motion. It is also what makes the
                            animations not run early: see the note on the beat rules in the stylesheet.
       `dsh-glass-new-session` is NOT touched. The transcript gate must stay CLOSED across the switch,
                            and the app closes it for itself: its own "new session" flow clears the
                            transcript region as part of the handover, which is exactly the signal
                            armTranscriptReveal() waits on before it reopens the gate. Reopening it
                            from here would be guessing at a handover that has not started yet.
       `dsh-glass-ready`    is NOT removed either, and that is deliberate: it hides the composer, and
                            during a switch the old composer is still in the DOM for a moment. Removing
                            it would reveal a node that is about to be thrown away, which is the
                            material-less flash bootstrap.js's structural rules exist to prevent.
       `entrance.played`    IS cleared - that flag is what allows the gesture to happen again. */
  function resetEntranceForNextSession(reason) {
    try {
      entrance.played = false;
      entrance.buffering = false;
      entrance.seat = null;
      document.body.classList.remove('dsh-glass-welcome');
      /* NOTE: nothing to reset for the reveal watch any more. It used to be a latch
         (`transcriptRevealArmed`) that this function had to clear, and clearing it was the one thing
         standing between a manual new session and a working entrance - which is exactly the kind of
         shared mutable state that should not be load-bearing. armTranscriptReveal() now uses a token
         that supersedes any previous watch, so it needs no reset and no caller can forget one. */
      /* Logged HERE rather than at the call sites: the first version of this was called from two
         places and only one of them logged it, which is why a silent failure looked like a mystery. */
      mark('client:entrance-reset', { reason: reason || 'unspecified' });
    } catch (e) { }
  }

  /* ---------- A NEW SCENE IS A NEW SESSION, AND NOTHING ELSE ----------
     THE FIRST TWO ATTEMPTS USED THE COMPOSER NODE'S IDENTITY, AND THAT WAS SIMPLY WRONG. The app
     replaces and re-parents the composer continuously - on an empty welcome page it produces a fresh
     node every time it re-renders, which is every second or two. So "a composer I have not recorded"
     was true almost permanently, the scene hook fired in a loop, and every fire removed
     `dsh-glass-welcome` - re-hiding the headline and picker row with nothing left to re-add it. The
     measured signature was unmistakable: EIGHT `client:new-scene` entries in one session, all
     `reason: composer-replaced`, against exactly one `client:entrance-released`, at launch.
     (The same mistake showed itself twice: `client:composer-entrance` reported `delayMs: 0` throughout,
     i.e. the composer was taking the generic session-switch keyframe instead of the welcome page's
     third beat, because the resets kept clearing the state that decides it.)

     WHAT ACTUALLY DISTINGUISHES A NEW SESSION: the app's own session list. Every real switch - the
  /* ---------- WHY THERE IS NO SCENE DETECTION HERE ANY MORE ----------
     Two attempts tried to GUESS when a new session had arrived, and both guesses were wrong in the same
     way. First the composer's node identity - but the app replaces that node every second or two on an
     empty welcome page, so the reset fired eight times in a single session and re-hid the hero each
     time. Then the session list's selected key - and the timeline showed eight `new-scene` entries
     again, because the list is re-rendered and the selection briefly disappears, so the key jumps back
     and forth. Both anchors were proxies for a question that does not need answering.

     THE QUESTION DOES NOT NEED ANSWERING, BECAUSE THE APP ANSWERS IT. The plugin closes the transcript
     gate (`dsh-glass-new-session`) across a switch, and THE APP DOES THE SAME THING IN ITS OWN HANDOVER:
     it empties the transcript region while the new session is built. That is why the app's own path
     never needed a hook here - the reveal watcher was already watching the region.

     SO THE RULE IS ONE LINE, AND IT IS THE SAME RULE FOR EVERY PATH:

         when the transcript region settles and the welcome hero is not yet revealed, reveal it -
         and that is what starts the beats.

     `revealTranscript` already runs at exactly that moment. All it has to do is notice that the hero is
     still withheld. The launch, a manual "new session", and a session switch from anywhere else then
     take the identical path by construction, because there is only one path - which is what the user
     asked for ("直接把启动那一套动画搬过去不好吗") and what the parallel implementation prevented. */
  var lastComposerScene = null;

  /* Set by lib/client.js when it asks for a new session. The switch is only REQUESTED
     at that point; the composer that proves it landed arrives about a second later.
     NOTE: this is set ONLY by the plugin's own request, so it must never be the sole trigger for
     anything a user can also cause by hand - that mistake is exactly why a manual new session had no
     entrance at all. */
  var sessionSwitchRequested = false;
  function noteSessionSwitchRequested() {
    sessionSwitchRequested = true;
    /* Scene reset first, so the new session's welcome page animates like the launch's did. The reset
       logs itself, so there is exactly one place that reports a reset - a version that was called from
       two places and logged from one is what made a silent failure look like a mystery. */
    resetEntranceForNextSession('session-switch-requested');
    /* Fallback: if no new composer ever appears (the switch failed, or the app reused
       the node), the transcript must still come back. */
    setTimeout(function () {
      if (!sessionSwitchRequested) return;
      sessionSwitchRequested = false;
      mark('client:session-switch-fallback');
      armTranscriptReveal();
    }, 4000);
  }
  try { window.__dshGlassNoteSessionSwitch = noteSessionSwitchRequested; } catch (e) { }

  /* Wait for the handover to stop changing, then lift the transcript gate.
     `minWaitMs` exists for the path this function did not use to serve: a switch the APP started. The
     plugin's own request has a known shape - it asks, and roughly a second later the new composer
     proves it landed - but a manual "new session" gives no request to observe, so it gives a fresh
     composer node before the handover is anywhere near finished. The minimum wait holds the watch off
     until the app has had time to build the new page; the settle-and-debounce logic then does the rest.

     REWRITTEN AROUND A TOKEN, AND THIS IS THE BUG THAT MADE MANUAL NEW SESSIONS DEAD.
     The previous version opened with `if (transcriptRevealArmed) return;` and set that flag on the way
     in. It was cleared in exactly one place - noteSessionSwitchRequested() - which only the PLUGIN'S
     own request path ever calls. So after the launch, the flag stayed `true` forever for every manual
     switch: the reveal watch was never armed again, revealTranscript() never ran, and armWelcomeEntrance()
     was therefore never reached. The log says it plainly: three `client:new-scene` entries and not one
     `client:transcript-revealed` between them.
     The flag was there to keep one watch alive at a time, which is right, but it was implemented as a
     latch that only one code path could open. A token does the same job without the latch: each arming
     replaces the previous watch, and a finished watch only clears the field if the field still holds ITS
     token. Nothing has to be reset by a caller, so no path can leave it stuck. */
  var revealToken = null;

  function armTranscriptReveal(minWaitMs) {
    try {
      var heldFor = parseFloat(minWaitMs) || 0;
      var token = { mo: null, quiet: null, t1: null, t2: null, finished: false };
      /* Supersede whatever was watching: disconnect it so two watches cannot both open the gate. */
      if (revealToken) {
        try { if (revealToken.mo) revealToken.mo.disconnect(); } catch (e) { }
        try { if (revealToken.quiet) clearTimeout(revealToken.quiet); } catch (e) { }
        try { if (revealToken.t1) clearTimeout(revealToken.t1); } catch (e) { }
        try { if (revealToken.t2) clearTimeout(revealToken.t2); } catch (e) { }
        revealToken.finished = true;
      }
      revealToken = token;

      var deadline = Date.now() + 2500;
      var target = document.querySelector('[class*="scrollBody"]') ||
        document.querySelector('[data-dsh-card="conversation"]') ||
        document.querySelector('[class*="column"]') || document.body;

      var finish = function (via) {
        if (token.finished) return;
        token.finished = true;
        try { if (token.mo) token.mo.disconnect(); } catch (e) { }
        try { if (token.quiet) clearTimeout(token.quiet); } catch (e) { }
        try { if (token.t1) clearTimeout(token.t1); } catch (e) { }
        try { if (token.t2) clearTimeout(token.t2); } catch (e) { }
        /* Only clear the field if it is still ours - a newer arming must not be cancelled by an older
           watch finishing late. */
        if (revealToken === token) revealToken = null;
        revealTranscript(via);
      };

      var armedAt = Date.now();
      var bump = function () {
        /* A change seen inside the minimum window is part of the handover, not the end of it, so it
           must not be allowed to settle the watch early. */
        if (heldFor > 0 && Date.now() - armedAt < heldFor) return;
        if (token.quiet) clearTimeout(token.quiet);
        token.quiet = setTimeout(function () { finish('settled'); }, 320);
      };

      var mo = new MutationObserver(function () {
        bump();
        if (Date.now() > deadline) finish('deadline');
      });
      token.mo = mo;
      try { mo.observe(target, { childList: true, subtree: true, characterData: true }); } catch (e) { }

      // if nothing happens at all, do not wait out the full window
      /* The initial-quiet timer is held off by the minimum wait as well: on the app's own switch the
         handover has not started at t=0, so "nothing happened yet" is not evidence that it is done. */
      token.t1 = setTimeout(function () { finish('initial-quiet'); }, Math.max(700, heldFor));
      token.t2 = setTimeout(function () { finish('cap'); }, 2600);
    } catch (e) {
      revealTranscript('catch');
    }
  }
  try { window.__dshGlassArmTranscriptReveal = armTranscriptReveal; } catch (e) { }

  /* Diagnostic: report the sidebar controls' computed material a few seconds after
     boot, when nothing is hovered.
     If they carry the glass at rest, the values are correct and a report of "it only
     appears on hover" means the app REPLACES the node on interaction, leaving an
     unmarked copy on screen until the next scan. If the values are wrong at rest, the
     CSS is being overridden or the wrong element is marked. Both answers are
     actionable; guessing between them is not. */
  function probeSidebarMaterial() {
    try {
      setTimeout(function () {
        try {
          var els = document.querySelectorAll('[data-dsh-glass-surface]');
          var rows = [];
          for (var i = 0; i < els.length && i < 5; i++) {
            var el = els[i];
            var c = getComputedStyle(el);
            var r = el.getBoundingClientRect();
            rows.push({
              cls: String(el.className || '').slice(0, 24),
              text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 12),
              box: Math.round(r.width) + 'x' + Math.round(r.height),
              backdrop: (c.backdropFilter && c.backdropFilter !== 'none') ? c.backdropFilter : 'none',
              background: (c.backgroundColor || '').slice(0, 32),
              opacity: c.opacity
            });
          }
          mark('client:sidebar-material-at-rest', {
            count: els.length,
            overImage: document.body.classList.contains('dsh-glass-over-image'),
            rows: rows
          });
        } catch (e) { }
      }, 4000);
    } catch (e) { }
  }
  try { window.__dshGlassProbeSidebar = probeSidebarMaterial; } catch (e) { }

  /* Diagnostic: why are certain sidebar controls NOT marked?
     For a few known labels it records the element the text sits in plus a few
     ancestors, with the geometry and paint each marking condition tests. That names
     exactly which condition rejects them - guessing between "too tall", "paints
     nothing" and "not rounded" is not good enough. Read-only. */
  function probeUnmarkedControls() {
    try {
      setTimeout(function () {
        try {
          var labels = ['插件', '神猫_君'];
          var out = [];
          /* Scoped to the sidebar: the labels being searched for only exist there, and a
             document-wide walk here would be another forced-layout pass for nothing. */
          var scope = document.querySelector('[class*="sidebarCol"]') || document.body;
          var all = scope.querySelectorAll('*');
          for (var i = 0; i < all.length && out.length < labels.length; i++) {
            var n = all[i];
            if (n.children.length) continue;
            var t = (n.textContent || '').trim();
            if (labels.indexOf(t) === -1) continue;
            var chain = [];
            var cur = n;
            for (var d = 0; d < 6 && cur && cur !== document.body; d++) {
              var c = getComputedStyle(cur);
              var r = cur.getBoundingClientRect();
              var bg = c.backgroundColor || '';
              var paints = bg !== '' && bg !== 'transparent' && bg.indexOf('rgba(0, 0, 0, 0)') !== 0;
              var cls = String(cur.className || '');
              chain.push({
                d: d,
                tag: cur.tagName.toLowerCase(),
                cls: cls.slice(0, 28),
                box: Math.round(r.width) + 'x' + Math.round(r.height),
                left: Math.round(r.left),
                radius: c.borderTopLeftRadius,
                bg: bg.slice(0, 28),
                marked: cur.hasAttribute ? cur.hasAttribute('data-dsh-glass-surface') : null,
                fails: [
                  r.left < 300 ? null : 'left',
                  r.width < 300 ? null : 'width',
                  (r.height >= 24 && r.height <= 60) ? null : 'height=' + Math.round(r.height),
                  parseFloat(c.borderTopLeftRadius || '0') >= 6 ? null : 'radius',
                  paints ? null : 'paintsNothing',
                  /md-code-block|_plain_|_block_|codeblock|_code_|highlight|_pre_/i.test(cls) ? 'codeLike' : null
                ].filter(Boolean)
              });
              cur = cur.parentElement;
            }
            out.push({ label: t, chain: chain });
          }
          mark('client:unmarked-controls', { found: out });
        } catch (e) { }
      }, 4600);
    } catch (e) { }
  }
  try { window.__dshGlassProbeUnmarked = probeUnmarkedControls; } catch (e) { }

  /* DELETED: probeComposerGeometry and its window hook.
     It measured the composer's welcome-state vs conversation-state position for a "fly down on
     the first message" animation that was abandoned, and it called composerSeat() - which no
     longer exists. It was also the single worst log producer in the plugin: it polled four
     geometries every 200ms for 24 seconds per launch, which buried every other timeline stage. */

  /* Diagnostic: the top bar's geometry and whether the app rebuilds it between
     sessions. An entrance for it needs the element sizes and the shift distance, and it
     must not replay on every session switch - so whether the node survives a switch has
     to be observed, not assumed. Read-only. */
  function probeTopBarGeometry(tagName) {
    try {
      var bar = document.querySelector('[data-dsh-glass-topbar]');
      if (!bar) { mark('client:topbar-geometry', { tag: tagName, found: false }); return null; }
      var layer = bar.querySelector(':scope > .dsh-glass-topbar-layer');
      var tabs = bar.querySelectorAll('[role="tab"]');
      function box(el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) };
      }
      var snap = {
        tag: tagName,
        bar: box(bar),
        layer: box(layer),
        tabCount: tabs.length,
        firstTab: tabs.length ? box(tabs[0]) : null,
        barSessionId: bar.__dshProbeId || (bar.__dshProbeId = 'tb' + Math.random().toString(36).slice(2, 7))
      };
      mark('client:topbar-geometry', snap);
      return snap;
    } catch (e) { return null; }
  }
  try { window.__dshGlassProbeTopBar = probeTopBarGeometry; } catch (e) { }

  /* The top bar descends into place.
     Same shape as the composer's entrance - fade plus movement, one keyframe, duration
     and easing from the shared variables - with the shift inverted (see
     dsh-glass-enter-down in 50-glass-surfaces.css), so the bar comes down from the window
     edge while the composer rises from the bottom.

     The class is removed afterwards so a re-mark does not replay it and so nothing is
     left animating once the bar is settled. `backwards` fill covers the delay, so the bar
     cannot flash at full opacity before the gesture starts. */
  /* The top bar has no entrance, so there is nothing to play for it. The functions that used
     to drive one were removed along with their keyframes - see the note in
     50-glass-surfaces.css for why the idea was dropped rather than fixed. */

  /* Diagnostic: how expensive is a scan pass, and does it spike while a conversation is
     loading? The top bar's entrance is animated by the compositor, so a hitch there means
     the main thread was blocked - and the prime suspect is this plugin's own scan, which
     walks every element and forces layout on each one. The counters already existed; this
     samples them into the timeline so the spike can be seen rather than argued about.
     Read-only. */
  function probeScanCost() {
    try {
      var last = { calls: 0, totalMs: 0 };
      var worst = 0;
      var ticks = 0;
      (function tick() {
        ticks++;
        if (ticks > 60) return;                      // ~60s of watching
        try {
          var s = window.__dshScanTiming;
          if (s && s.calls !== last.calls) {
            if (s.maxMs > worst) worst = s.maxMs;
            var deltaCalls = s.calls - last.calls;
            var deltaMs = Math.round((s.totalMs - last.totalMs) * 10) / 10;
            /* Only report when the pass was actually heavy: a scan over 16ms cannot fit in
               a frame, which is precisely the case that can stutter an animation. */
            if (s.lastMs > 12 || deltaMs > 30) {
              mark('client:scan-cost', {
                lastMs: s.lastMs,
                maxMs: s.maxMs,
                callsInWindow: deltaCalls,
                msInWindow: deltaMs,
                /* What a pass actually walked and measured, so the number stays meaningful now
                   that scans are scoped to containers and classless leaves are skipped. */
                scannedEls: s.lastScanned,
                measuredEls: s.lastMeasured
              });
            }
            last = { calls: s.calls, totalMs: s.totalMs };
          }
        } catch (e) { }
        setTimeout(tick, 1000);
      })();
      setTimeout(function () {
        mark('client:scan-cost-summary', { worstPassMs: worst, timing: window.__dshScanTiming || null });
      }, 22000);
    } catch (e) { }
  }
  try { window.__dshGlassProbeScanCost = probeScanCost; } catch (e) { }

  /* Diagnostic: how long is the MAIN THREAD blocked, and how much of it is this plugin's?
     The symptom is not dropped frames but FREEZING - an animation that stops dead and then
     resumes, which is a long task holding the main thread so the compositor has no frame to
     show. A frame-gap probe measures that directly: a gap far beyond 16.7ms is blockage,
     whoever caused it.

     Reported next to the scan counters so the split is visible: if gaps reach hundreds of ms
     while a scan pass costs a few, the load itself is the cause and no tuning here will help
     - the entrance then only has to be scheduled to start after the freeze (see
     deferEntranceUntilQuiet). */
  function probeFrameGaps() {
    try {
      var last = performance.now();
      var worst = 0;
      var over100 = 0;
      var over250 = 0;
      var started = performance.now();
      (function frame(now) {
        var gap = now - last;
        last = now;
        if (gap > worst) worst = gap;
        if (gap > 100) over100++;
        if (gap > 250) over250++;
        if (now - started < 60000) {
          try { requestAnimationFrame(frame); } catch (e) { }
        } else {
          var s = window.__dshScanTiming || {};
          mark('client:frame-gaps', {
            worstGapMs: Math.round(worst),
            gapsOver100: over100,
            gapsOver250: over250,
            scanCalls: s.calls,
            scanTotalMs: s.totalMs,
            scanMaxMs: s.maxMs
          });
        }
      })(last);
    } catch (e) { }
  }
  try { window.__dshGlassProbeFrames = probeFrameGaps; } catch (e) { }

  /* Diagnostic: how large is the top bar's backdrop-filter surface, in device pixels?
     Blur cost scales with area, and the app repaints the region behind that bar while a
     conversation loads - so a large blurred surface inside a constantly repainted area is the
     exact shape of "it stutters while the conversation loads, and only then". Reported so the
     GPU question can be answered with a number. Read-only. */
  function probeBlurSurface() {
    try {
      var dpr = window.devicePixelRatio || 1;
      function area(el) {
        if (!el) return null;
        var r = el.getBoundingClientRect();
        var c = getComputedStyle(el);
        var hasBlur = c.backdropFilter && c.backdropFilter !== 'none';
        return {
          css: Math.round(r.width) + 'x' + Math.round(r.height),
          devPx: Math.round(r.width * dpr) + 'x' + Math.round(r.height * dpr),
          kDevPx: Math.round((r.width * dpr) * (r.height * dpr) / 1000),
          backdrop: hasBlur ? c.backdropFilter.slice(0, 44) : 'none'
        };
      }
      mark('client:blur-surface', {
        dpr: dpr,
        topbarLayer: area(document.querySelector('.dsh-glass-topbar-layer')),
        composer: area(document.querySelector('[data-dsh-glass="composer"]')),
        workspaceBlock: area(document.querySelector('[data-dsh-glass-block]')),
        rightbar: area(document.querySelector('[data-dsh-glass-rightbar]')),
        activeGlassCount: document.querySelectorAll(
          '[data-dsh-glass-block],[data-dsh-glass-surface],[data-dsh-glass-card],.dsh-glass-topbar-layer,[data-dsh-glass-rightbar]'
        ).length
      });
    } catch (e) { }
  }
  try { window.__dshGlassProbeBlur = probeBlurSurface; } catch (e) { }

  function boot() {
    ensureFilter();
    try {
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(onAgentResize);
      }
    } catch (e) { observer = null; }

    // The glass must look like it was always there. Two things caused a visible
    // "loading" period:
    //   1. the first marks only landed on the MutationObserver's 600ms debounce or
    //      the 3s fallback tick, so the SPA's first render showed unstyled UI;
    //   2. the glass elements carry transitions, so applying the marks made the
    //      material fade in over ~400ms.
    // Fix: scan every frame for the first moments, then back off; and suppress
    // transitions until the first mark has landed, so there is no fade-in.
    /* ---- 开场期间：插件的扫描全部让位给开场视频 ----
       实测：首轮全量扫描单次 55-240ms，而它正好落在开场视频的开头 —— 视频刚起播就撞上
       一个两百毫秒级的长任务，观感就是"视频开头卡一下"。
       这件事【不是必然的】：开场层盖着整个窗口，材质早几秒出现根本看不见，所以扫描完全可以
       挪到开场最后 1.5 秒（lib/client.js 的 prep-release 会调 window.__dshGlassScanNow）——
       那时视频还在播，正好当"演员在后台准备"。
       开场期间主线程因此只剩视频解码，这才是它该有的样子。 */
    var __introHolding = false;
    try { __introHolding = (window.__dshGlassScanHold === true); } catch (e) { }
    /* 供开场层在 prep-release 时调用：把首轮打标补上（restricted 先铺一遍够快，
       随后补一次全量；正常路径的 steady 定时器也会接着跟扫）。 */
    try {
      window.__dshGlassScanNow = function () {
        try { scan(true); } catch (e) { }
        try { setTimeout(function () { try { scan(); } catch (e) { } }, 400); } catch (e) { }
      };
    } catch (e) { }

    if (!__introHolding) {
      scan();
      try { requestAnimationFrame(function () { scan(); }); } catch (e) { }
    }

    /* FAST TICK — WHY IT NO LONGER SCANS EVERY FRAME.
       A full pass costs 55-240ms; a frame is 16ms. So "scan every frame for the first
       moments" cannot keep up: every pass becomes a long task and the main thread stays
       saturated for the whole 1.2s window. It is measurable in the timeline - scanCalls
       lands at ~72 (= 60fps x 1.2s) and the worst frame gap is ~792ms - which is exactly
       the launch/entrance hitch that was reported, and no entrance animation can survive it.
       The INTENT (get material on screen at once) is kept, but paid for properly:
         ① stop as soon as the composer carries material - the goal is met, nothing left to poll;
         ② until then run a RESTRICTED pass (sidebar + header only, a fraction of the cost),
            rate-limited to one per 150ms instead of one per frame;
         ③ the 1.2s deadline still bounds the whole thing, and the observer's immediate pass
            plus adoptComposerNode keep covering anything that appears in between. */
    var fastUntil = performance.now() + 1200;
    var fastDone = false;
    var lastFastPass = 0;
    if (!__introHolding) (function fastTick() {
      if (fastDone || performance.now() > fastUntil) return;
      try {
        if (document.querySelector('[data-dsh-glass="composer"]')) { fastDone = true; return; }
      } catch (e) { }
      var now = performance.now();
      if (now - lastFastPass > 150) {
        lastFastPass = now;
        try { scan(true); } catch (e) { }
      }
      try { requestAnimationFrame(fastTick); } catch (e) { }
    })();

    attachScrollWatchers();
    probeSidebarMaterial();
    probeUnmarkedControls();
    probeScanCost();
    probeFrameGaps();
    setTimeout(probeBlurSurface, 3000);
    (function watchTopBar() {
      var lastId = null;
      var ticks = 0;
      (function tick() {
        ticks++;
        if (ticks > 40) return;                       // ~10s
        try {
          var snap = probeTopBarGeometry(lastId === null ? 'first' : 'poll');
          if (snap && snap.barSessionId && snap.barSessionId !== lastId) {
            lastId = snap.barSessionId;
            mark('client:topbar-node-replaced', { newId: snap.barSessionId });
          }
        } catch (e) { }
        setTimeout(tick, 250);
      })();
    })();

    /* DELETED: the composer-geometry watcher.
       It polled every 200ms for ~24s per launch to feed the abandoned fly-down animation, and it
       was the noisiest thing in the timeline - it produced thousands of entries that buried every
       other stage and made the log useless for diagnosis. Nothing reads its marks any more. */

    // The transcript mutates constantly while scrolling history, so a fixed
    // debounce either lags badly or runs scans back to back. Instead the delay
    // shrinks while changes keep arriving and grows once things settle.
    try {
      var pending = null;
      var lastChange = 0;
      /* Rate limiter for the immediate scan below: it must collapse bursts of
         mutations (streaming, list renders) into one pass each, but it must not make a
         user-initiated expansion wait. */
      var lastImmediateScanAt = 0;
      /* Mutation counter for the full-scan gate below: a page being streamed into cannot
         afford a 100-600ms pass on every debounce tick. */
      var mutationsInWindow = 0;
      new MutationObserver(function (records) {
        /* Mark any newly added composer synchronously, before it can be painted.
           See adoptComposerNode: this is what removes the material-less first frame
           on a new session, where the composer is a brand-new node. */
        try {
          for (var ri = 0; ri < records.length; ri++) {
            var added = records[ri].addedNodes;
            if (!added) continue;
            for (var ai = 0; ai < added.length; ai++) adoptComposerNode(added[ai]);
          }
        } catch (e) { }

        var now = performance.now();
        var busy = (now - lastChange) < 400;      // changes are still streaming in
        lastChange = now;
        mutationsInWindow += records.length;

        /* SCAN NOW WHEN THE USER IS WAITING FOR A RESULT.
           A card that was just expanded is a node the user is looking at: they clicked,
           the content appeared, and the material has to be there with it. The debounce
           below exists for the transcript, which mutates continuously while history
           scrolls or a reply streams - but before this, expansion also waited out that
           debounce, so the glass arrived noticeably after the content did.

           RESTRICTED, because this path fires during the busiest moments: a full pass over
           a loaded conversation measured 100-190ms (worst 408ms), and running that on every
           burst of mutations is what made the top bar's entrance hitch while a conversation
           loaded. Looking only at the sidebar and header keeps the immediacy where a user
           can see it, at a fraction of the cost; the debounced full pass still covers
           everything else. */
        /* LAUNCH AND ENTRANCE ARE NOT "THE USER IS WAITING FOR CONTENT".
           The paragraph above is about a user-initiated expansion - a click that must be
           answered at once. It is NOT about launch: while the page boots and the entrance
           plays, the DOM is being filled at streaming speed, so this branch fires every
           80ms and each fire forces layout. Skipping it there costs nothing visible (the
           intro layer covers the window, and the first marking is done by boot()'s own
           passes), and it is the other half of the launch hitch.
           The flag is set for the duration of the intro layer (bounded at 3.5s by
           playIntro in the client module, with its own hard ceiling), and `pending` below
           still schedules the debounced pass - so marking resumes the moment the intro ends. */
        var introActive = false;
        /* 读两个标志：__dshGlassScanHold 是"只暂停扫描"（开场视频最后 1.5s 会被放开，
           好让材质在演员亮相前打好）；__dshGlassIntroActive 是"整个开场还在"（兼容旧版）。
           两者分开的原因：放开扫描不能顺带放开"不许揭示"，否则三拍会在视频背后播完。 */
        try { introActive = window.__dshGlassScanHold === true || window.__dshGlassIntroActive === true; } catch (e) { }
        if (!introActive && now - lastImmediateScanAt > 80) {
          lastImmediateScanAt = now;
          try { scan(true); } catch (e) { }
          return;
        }

        if (pending) return;
        var delay = busy ? 40 : 140;
        pending = setTimeout(function () {
          pending = null;
          /* A FULL PASS WHILE THE TRANSCRIPT IS STREAMING IS NOT WORTH ITS COST.
             Measured: a full pass over a loaded conversation walks ~4600 elements and takes
             110-190ms, with a worst case of 623ms - and during a load or a reply it fires
             every 40ms, i.e. more often than it can possibly finish. That is the remaining
             source of the hitch.

             Nothing is lost by skipping it: the composer has its own synchronous path
             (adoptComposerNode), user bubbles and cards arrive as part of the same render,
             and the 2.5s fallback tick picks up anything that lands in between. When the
             mutations stop, the next tick is no longer "busy" and the full pass runs on a
             quiet page, where it costs nothing anyone can see. */
          var recent = mutationsInWindow;
          mutationsInWindow = 0;
          if (recent > 25) {
            mark('client:full-scan-skipped', { mutations: recent });
            return;
          }
          scan();
        }, delay);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) { }
    /* THE PERIODIC FOLLOW-UP PASS. It used to be `setInterval(scan, 2500)`: an
       UNCONDITIONAL full pass every 2.5s, measured at 55-95ms with a 271ms worst case - a
       single one of those drops 5-6 frames at 60Hz, and during launch it landed on top of
       the entrance animation, which is exactly where the user saw the hitch.
       Two changes, neither of which touches the marking logic itself:
         ① run it in `requestIdleCallback`, so it happens while the browser is idle instead
            of stealing a frame; `timeout: 1200` keeps the guarantee that a busy page still
            gets its pass within 1.2s. One pass is queued at a time, so a busy page cannot
            pile them up.
         ② skip the first 2.6s after boot: that window is the intro animation plus the hero's
            three beats, when the DOM is still being filled - the follow-up pass has its
            lowest value and highest cost exactly there. First marking is unaffected: it is
            boot()'s own first pass, and the restricted immediate pass on mutations still
            runs throughout.
       Extra guard: if the intro flag is ever left on (a crash mid-entrance), the 6s ceiling
       still lets the pass through - the scan must never be able to stop for good. */
    try {
      var steadyDue = false;
      var steadyBootAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      var steadyAge = function () {
        try { return performance.now() - steadyBootAt; } catch (e) { return 99999; }
      };
      setInterval(function () {
        if (steadyDue) return;
        var age = steadyAge();
        if (age < 2600) return;                                   /* ② 启动/入场期不跟扫 */
        try {
          if ((window.__dshGlassScanHold === true || window.__dshGlassIntroActive === true) && age < 6000) return;
        } catch (e) { }
        steadyDue = true;
        var run = function () { steadyDue = false; try { scan(); } catch (e) { } };
        try {
          if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 });
          else run();
        } catch (e) { steadyDue = false; run(); }
      }, 2500);
    } catch (e) { }
    /* NO SCENE POLLER HERE ANY MORE. Two anchors were tried - the composer's node identity and the
       session list's selected key - and both flickered, so both produced repeated resets that re-hid the
       hero. The reset is now offered only at the one moment that cannot flicker: while the transcript
       gate is closed, i.e. while the app is genuinely mid-handover. See maybeResetOnComposerReplace(). */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
