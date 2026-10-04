# dsh-plugin-liquid-glass

**Liquid-glass beautification plugin for DSH desktop.** Gives the composer, message
bubbles, sidebar, top bar and menus a liquid-glass material. Works alongside wallpaper
plugins. Dark mode only.

**What it actually covers** (the marketplace checks the description against the code,
so this is the exact scope): the composer (true refraction), user message bubbles,
the assistant card, sidebar workspace blocks, the top bar and its tabs, right-sidebar
panels, sidebar control pills, and menu/popup material.

**Wallpaper plugins:** presence is detected by *capability*, not by vendor, across
three layers (explicit contract / known hooks / generic structural test), so **any
wallpaper plugin can be used alongside this one**. You can also opt out of the
plugin's own background explicitly with `data-dsh-glass-canvas="off"`.

> **Status: v0.1.4 (first public release, published to npm)**
>
> - **DSH desktop only.** In a browser the plugin disables itself entirely (registers
>   no UI, changes nothing) and shows a one-time notice. This is a deliberate
>   limitation, not an untested path.
> - **Light mode is not supported yet.** The v0.1.4 materials are tuned for dark
>   backgrounds only, so the appearance is locked to dark. Picking "Light" or
>   "Follow system" is intercepted and explained.
>   To unlock anyway, create an empty file `glass-theme-lock-off` in `~/.dsh/`.
> - Verified on Windows desktop: materials, intro, theme lock and the update
>   channel all work.

---

## Install

```bash
dsh plugin --profile desktop add dsh-plugin-liquid-glass
```

Then **restart DSH** — the material stylesheets are injected at boot.

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
| Composer (input box) | **True refraction** — SVG displacement map + blur + pointer highlight | Navigation |
| User message bubble | Glass look — self-lit gradient, hairline edge, inner highlight | Content |
| Assistant card | Glass look + 900px narrowing + smooth growth | Content |

On the navigation / content distinction: Apple stated at WWDC25 that glass belongs
to the **navigation layer**. The composer floats above scrolling content, so there
is something continuous behind it to refract — it gets true refraction. Message
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
