# dsh-desktop-glass

Frosted glass for the DSH desktop app. The window shows the desktop wallpaper through a translucent blue page, no divider lines.

<!-- drop a screenshot in and uncomment
![screenshot](docs/screenshot.png)
-->

Full effect is Windows-only, since it uses the system Mica / Acrylic materials. Elsewhere the plugin still installs, but you only get the translucent page. Verified on DSH 0.2.0-rc.2.

[中文说明](README.md)

## Why there are two parts

The window material is a `BrowserWindow` option in the Electron main process — it lives in `main.js` inside `app.asar`. A plugin can't reach it; a plugin can only inject CSS. So the full effect needs both:

- **The plugin** (repo root) — the page half: translucent background, per-column gradients, panel transitions, no dividers
- **The patcher** (`windows-acrylic/`) — the window half: puts `backgroundMaterial` and a transparent `backgroundColor` back on the main window

Plugin only: translucent page, opaque window, no wallpaper. Patcher only: see-through window, solid page. You need both.

## Install

Needs Node.js 18+. The patcher runs `node --check` for syntax validation and falls back to the Node runtime bundled with DSH if `node` isn't on PATH.

Install the plugin:

```powershell
node scripts/install-plugin.mjs
```

It copies the repo into `<DSH_HOME>\profiles\desktop\node_modules\dsh-desktop-glass` and adds the bundle entry and dependency to the profile's `package.json`. Restart DSH afterwards.

Apply the window-material patch (Windows):

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-acrylic\apply-acrylic.ps1
```

It waits for DSH to exit. Run it, then quit DSH from the tray — it patches and restarts the app itself.

Options: `-Material mica`, `-AppRoot <dir>` if auto-detection misses, `-DryRun` to detect and generate without touching installed files.

If the window stays opaque, check `Settings → Personalization → Colors → Transparency effects`.

## Tuning

Change the last number in the `rgba(...)` values in `lib/client.js`. Higher is more opaque.

| What | Line | Default |
|---|---|---|
| Page background | 33 | `rgba(224, 242, 254, 0.24)` |
| Sidebar | 34 | `rgba(186, 230, 253, 0.28)` |
| Column gradient start | 63 / 66 / 69 | `rgba(186, 230, 253, 0.42)` |
| Sidebar gradient end | 63 | `rgba(224, 242, 254, 0.14)` |
| Center / right gradient end | 66 / 69 | `rgba(240, 249, 255, 0.10)` |

Leave `bg-layer-1/2/3` (lines 35–37) alone. Those are cards and panel surfaces floating above the content, and making them translucent smears the settings UI.

For a different shade of blue, change the RGB of the three gradient starts. Light to dark: `#F0F9FF` `#E0F2FE` `#BAE6FD` `#7DD3FC` `#38BDF8`.

Re-run the installer and restart. If you installed with `--link`, just restart.

## Uninstall

```powershell
node scripts/uninstall-plugin.mjs
powershell -ExecutionPolicy Bypass -File .\windows-acrylic\restore-asar.ps1
```

The plugin injects one `<style>` tag, so uninstalling leaves nothing behind.

## Known issues

**Acrylic goes opaque when the window loses focus.** That's Windows downgrading the material; nothing to do about it. Use `-Material mica` if it bothers you — it degrades less.

**DSH updates overwrite `app.asar`**, so the glass disappears. Re-run the patcher.

**The patch trims a doc comment.** To keep `main.js` the same length it has to remove an equal number of bytes, and it takes them from a JSDoc comment. No effect on behaviour.

**If DSH ever restructures the main window block**, the patcher fails loudly and leaves installed files untouched. It matches on an anchor, not a version.

**If a build enables Electron's embedded asar integrity validation**, patching will stop it from starting. Restore with `restore-asar.ps1`. Current DSH builds don't enable it.

Patching `app.asar` modifies the host application. Your call on the risk; also mind DSH's licence terms.

## How it works

**Plugin.** In the Windows layout the background is a stack of opaque layers (`.frame` → `.centerCol` → `ConversationRoot.root`); even at alpha 0.7 the composite is nearly solid. macOS doesn't have this problem — its `.frame` is already transparent, which is why vibrancy shows through there. So the plugin makes `.frame` fully transparent, makes the page base and sidebar translucent, and puts a gradient on each column for depth. Class names are matched by suffix (`[class*="_centerCol"]`) so hashed build names don't matter.

**Patcher.** An asar is a header JSON plus raw entry bytes, and the header records each entry's offset, size and integrity hash. Growing `main.js` would shift every later entry. So the patch inserts the two properties and removes an equal number of bytes from a comment, keeping `main.js` the same length and only updating its own hash.

## Layout

```
package.json            plugin manifest (repo root is the package)
cordis.patch.yml        bundle patch that mounts the plugin
lib/client.js           browser half, injects the CSS
lib/index.js            host half, empty
windows-acrylic/        window-material patcher
scripts/                install / uninstall
```

`backups/` and `build/` are generated at runtime and git-ignored.

## License

[MIT](LICENSE)
