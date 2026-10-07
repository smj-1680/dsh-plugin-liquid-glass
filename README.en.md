# dsh-plugin-liquid-glass

**Liquid-glass beautification plugin for DSH desktop.** Gives the composer, message
bubbles, sidebar, top bar and menus a liquid-glass material. Works alongside wallpaper
plugins. Dark mode only.

**What it actually covers** (the marketplace checks the description against the code,
so this is the exact scope): the composer, user message bubbles,
the assistant card, sidebar workspace blocks, the top bar and its tabs, right-sidebar
panels, sidebar control pills, and menu/popup material.
The material is translucent glass: a tint fill, a background blur, inner highlights,
a hairline border and a drop shadow.

> **Wording note:** this line used to say "the composer (true refraction)". The current
> release (0.1.62) uses a **background blur** (`backdrop-filter: blur`), with **no
> displacement refraction** — `git show HEAD:artifacts/client.js` contains zero
> occurrences of `dsh-lens`. The refraction version (an SVG `feDisplacementMap` lens)
> is still in local development and has not been committed. The marketplace checks the
> description against the code, so "refraction" is deliberately not claimed here; it
> will be restored once it actually ships.

**Wallpaper plugins:** presence is detected by *capability*, not by vendor, across
three layers (explicit contract / known hooks / generic structural test), so **any
wallpaper plugin can be used alongside this one**. You can also opt out of the
plugin's own background explicitly with `data-dsh-glass-canvas="off"`.

> **Status: v0.1.62 (published to npm)**
>
> - **First install asks for a quality level.** On the first launch after installing
>   (once the intro finishes) a five-tier picker appears so you choose for your own
>   machine - picking too high causes stutter. Change it later in Settings -> Liquid Glass.
>
> - **DSH desktop only.** In a browser the plugin disables itself entirely (registers
>   no UI, changes nothing) and shows a one-time notice. This is a deliberate
>   limitation, not an untested path.
> - **Light mode is not supported yet.** The materials are tuned for dark
>   backgrounds only, so the appearance is locked to dark. Picking "Light" or
>   "Follow system" is intercepted and explained.
>   To unlock anyway, create an empty file `glass-theme-lock-off` in `~/.dsh/`.
> - Verified on Windows desktop: materials, intro, theme lock and the update
>   channel all work.

---

## Install

### Option 1: run the installer script (easiest)

Download **`install-liquid-glass.cmd`** from this repo's Releases page and double-click it.
It locates DSH's bundled command-line tool on its own, runs the install below, and tells
you whether it worked.

> **The file in the repository is named `安装插件.cmd` - it is the same file.**
> GitHub Release asset names do not support Chinese, and uploading it under that name
> silently degrades to a meaningless `default.cmd`, so the Release asset uses an English
> name while the source file keeps the Chinese one. Identical content (3515 bytes, same SHA-256).

> **It installs from npm, not directly from this repository.** The sources contain no build
> output, and installing from a `github:` source via pnpm 10+ triggers the `allowBuilds`
> approval prompt. Going through npm is more reliable and is automatically mirrored in China.
> So this route **does not need the plugin marketplace**, but it does still need a network.

### Option 2: command line

```bash
dsh plugin --profile desktop add dsh-plugin-liquid-glass
```

### Option 3: plugin marketplace

Search for "liquid glass". The code is identical to the other routes; the marketplace is
just another entry point.

---

**Either way, restart DSH afterwards** — the material stylesheets are injected at boot.

**On first launch it asks once for a quality level** (after the intro finishes). Pick one
that suits your machine - too high causes stutter. Change it later in Settings -> Liquid Glass.

### Uninstall

```bash
dsh plugin --profile desktop remove dsh-plugin-liquid-glass
```

The plugin only injects styles; it never modifies DSH's own files, so removing it
restores the stock appearance.

---

## What it does

| Surface | Effect | Layer |
|---|---|---|
| Composer (input box) | Translucent glass — background blur + pointer-following highlight | Navigation |
| User message bubble | Glass look — self-lit gradient, hairline edge, inner highlight | Content |
| Assistant card | Glass look + 900px narrowing + smooth growth | Content |

> ⚠ **Factual correction:** this table used to read
> "**True refraction** — SVG displacement map + blur + pointer highlight" for the
> composer. In release 0.1.62 the composer's material is a background blur only
> (`backdrop-filter: blur(var(--dsh-glass-blur, 32px)) saturate(...) brightness(...)`);
> there is no SVG displacement map in the shipped code. The refraction version is
> still in local development. The paragraph below describes the *design intent* that
> the refraction work is meant to serve — it is kept for context, not as a claim
> about the current release.

On the navigation / content distinction: Apple stated at WWDC25 that glass belongs
to the **navigation layer**. The composer floats above scrolling content, so there
is something continuous behind it that a refraction pass *could* sample. Message
content sits on a flat transcript, so refracting it would distort the text and hurt
readability — those get the glass *look* only. The distinction is a requirement,
not a preference.

---

## Settings

`Settings → Liquid Glass`:

- **Quality tier** — Very low / Low / Medium / High / Very high.
  Lower tiers drop the blur (the expensive part) and, at the lowest tiers, skip the
  intro. Changing this **requires a DSH restart** to fully apply.
- **Snapshot updates** — off by default (stable channel). Turning it on switches
  "Check for updates" to the snapshot channel.
- **Check for updates** — queries the channel you selected.

Two release channels are kept apart by npm dist-tag **and** a prerelease suffix:
snapshots carry `-snapshot.<date>.<random>`, which always sorts *below* the same
stable version, so a snapshot can never supersede a stable release.

---

## Open source, and what that means for modifications

This plugin is **MIT licensed**. You may modify it freely — but please understand
three things first:

**1. Once modified, it is no longer the official build.** Any problem that appears
after you (or an AI you use) change the source is **your responsibility**; the
developer **does not fix it**. This is the formal MIT position (the full AS IS
clause and the modification notice are in `LICENSE` and `AUTHOR-NOTICE.txt`), not
a verbal request.

**2. You can tell in five seconds whether it was modified.** In the plugin
directory:

```bash
node verify-integrity.mjs
```

It compares every file against the published SHA-256 manifest:

- "**unmodified**" → this is the official build; please report problems
- "**this code has been changed**" → reinstall the official build before debugging

**3. To restore the official build, just reinstall:**

```bash
dsh plugin --profile desktop add dsh-plugin-liquid-glass
```

**Why this section exists:** open source cannot prevent modification (that is the
definition of open source), but "has this been modified?" should be a **decidable
fact** rather than a matter of opinion. Every release therefore ships a per-file
manifest (`INTEGRITY.json`).

---

## Requirements

- DSH desktop (Electron). The plugin detects the runtime via
  `<html data-platform>` — the same signal DSH's own `detectEnvironment()` uses.
  No `data-platform` means a browser, and the plugin stays off.

## Known limitations

1. **Light mode is not supported yet.** The materials are tuned for dark
   backgrounds, so the appearance is locked to dark.
   To unlock: create an empty file `glass-theme-lock-off` in `~/.dsh/`.
2. **Desktop only.** In a browser the plugin disables itself entirely.
3. **Native white window background.** For roughly one second between the window
   appearing and the page's first frame, the system's light background is visible
   (harsh under a dark theme). This is decided by DSH's own window configuration in
   the main process — **the plugin cannot fix it** (there is no IPC channel for it).
4. **Class-name hashes.** Some CSS selectors match on build-time generated class
   hashes, which may differ between `dsh-web-frontend` versions.

## Troubleshooting: enabling the diagnostic log

Diagnostics are **off by default** (when enabled, one launch writes ~277 lines /
40 KB into the plugin directory). To turn them on — no code changes needed:

```js
// run in the console, then reload the page
localStorage.setItem('dsh-glass-probe', '1')
```
- or append `?dshGlassProbe=1` to the URL
- or run `window.__dshGlassProbe = true` in the console (takes effect on the next launch)

The timeline is then written to `artifacts/startup-timeline.log`.
**Turn it back off when done:** `localStorage.removeItem('dsh-glass-probe')`.

## License

MIT — see [`LICENSE`](LICENSE). The full modification notice is in
[`AUTHOR-NOTICE.txt`](AUTHOR-NOTICE.txt).
