# dsh-desktop-glass

A **frosted-glass look for the DeepSeek Harness desktop app**: the window shows the desktop wallpaper through a translucent sky-blue page, with no divider lines.

> Full frosted glass requires **Windows** (it uses the native Mica / Acrylic window materials). On other platforms only the translucent page half applies.

[中文说明](README.md)

---

## What you get

- **Desktop shows through** — the main window uses a Windows Acrylic / Mica material
- **Translucent sky-blue page** — page background and sidebar become semi-transparent
- **Three-column gradients** — sidebar / center / right column each get their own linear gradient
- **Panel transition** — center and right panels fade + slide in on switch
- **No divider lines** — column radius, header underline, dock separator, sidebar border all removed

---

## ⚠️ It takes two halves

This is the part people get wrong: **a plugin cannot set the window material.** That is an Electron main-process `BrowserWindow` option baked into `main.js` inside `app.asar`. A DSH client plugin can only inject CSS — it cannot change whether the window itself is see-through.

| Half | What it does | How to install | If missing |
|---|---|---|---|
| **Client plugin**<br>`lib/client.js` | Translucent page, gradients, transitions, no dividers | Into the DSH profile (the repo root *is* the plugin package) | Window is see-through, but a solid page colour hides it |
| **Window-material patcher**<br>`windows-acrylic/` | Restores `backgroundMaterial` / `backgroundColor` on the main window (Windows) | Run `apply-acrylic.ps1` | Page is translucent, but the window is opaque |

---

## Install

### Requirements

- DSH desktop app on Windows
- **Node.js 18+** for the patcher (it uses `node --check` for syntax validation; it falls back to the Node runtime bundled with DSH)

### 1. Install the client plugin

```powershell
# from the repository root
node scripts/install-plugin.mjs
```

Then **restart DSH**.

Options: `--dry-run`, `--link` (symlink instead of copy, handy while tweaking), `--profile <dir>`.

### 2. Apply the window-material patch (Windows only)

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-acrylic\apply-acrylic.ps1
```

The script **waits for DSH to exit**: run it, then right-click the tray icon → Quit. It then patches, verifies and restarts the app.

Options: `-Material mica`, `-AppRoot <dir>`, `-NodePath <path>`.

The install directory is auto-detected from: the running process → the uninstall registry entry → common install paths.

### 3. Verify

The window should show the desktop wallpaper. If it stays opaque, enable **Settings → Personalization → Colors → Transparency effects**.

---

## Tuning

Edit the `rgba(...)` alpha (the **last** number) in [`lib/client.js`](lib/client.js):

| Target | Line | Default | Notes |
|---|---|---|---|
| Page base `--dsw-alias-bg-base` | 33 | `rgba(224, 242, 254, 0.24)` | Whole-page background |
| Sidebar `--dsw-specific-sidebar-fill` | 34 | `rgba(186, 230, 253, 0.28)` | Left sidebar fill |
| Gradient start (all three columns) | 63 / 66 / 69 | `rgba(186, 230, 253, 0.42)` | Change the RGB values to recolour |
| Sidebar gradient end | 63 | `rgba(224, 242, 254, 0.14)` | |
| Center / right gradient end | 66 / 69 | `rgba(240, 249, 255, 0.10)` | |
| `--dsw-alias-bg-layer-1/2/3` | 35–37 | `0.94` | **Leave alone** — these are card/panel surfaces floating above content; making them translucent smears the settings UI |

Re-run `node scripts/install-plugin.mjs` and restart DSH. (With `--link`, just restart.)

Sky-blue ramp, light to dark: `#F0F9FF` → `#E0F2FE` → `#BAE6FD` → `#7DD3FC` → `#38BDF8`

---

## Uninstall

```powershell
node scripts/uninstall-plugin.mjs
powershell -ExecutionPolicy Bypass -File .\windows-acrylic\restore-asar.ps1
```

The plugin is non-invasive: it injects a single `<style>` and removes it cleanly on uninstall.

---

## Compatibility

- Windows 10 / 11, with system transparency effects enabled
- Verified on DSH **0.2.0-rc.2**
- The patcher matches the main window's `win32 && primary` branch by **anchor**, not by version. After a DSH update, re-run the same script. If a future build restructures that branch, the script **fails loudly without touching any installed file**
- Non-Windows: the plugin still installs (translucent page), but the window-material patch does not apply

---

## Known limitations

- **Acrylic degrades when the window loses focus** — that is DWM behaviour, not something this project controls. Use `-Material mica` if it bothers you
- **DSH auto-updates overwrite `app.asar`**, so the glass disappears; re-run `apply-acrylic.ps1`
- The patch is **byte-neutral**: it trims a short, irrelevant JSDoc comment to keep `main.js` the same length
- A build with Electron's **embedded asar integrity validation** enabled would refuse to start after patching; restore with `restore-asar.ps1`. Current DSH desktop builds do not enable it
- Patching `app.asar` modifies the host application — evaluate the risk yourself and mind DSH's licence terms

---

## How it works

**Why the plugin cannot just retune tokens.** In the Windows layout the background is a stack of opaque layers (`.frame` → `.centerCol` → `ConversationRoot.root`); even at alpha 0.7 the composite is ~99% opaque. macOS differs — its `.frame` is already `transparent`, which is why vibrancy shows through there. So the plugin makes `.frame` fully transparent, makes the page base and sidebar translucent, and adds a gradient per column for depth. Class names are matched by suffix (`[class*="_centerCol"]`) so hashed build names do not matter.

**Why the patcher is byte-neutral.** An asar is a header JSON plus raw entry bytes; the header stores each entry's `offset`, `size` and integrity hash. Growing `main.js` would shift every later entry. So the patcher inserts the two properties, trims an equal number of bytes from a real doc comment, keeps the entry size identical (all offsets unchanged), and only updates that entry's integrity hash (`hash` and `blocks[0]`, which coincide for a single block).

---

## Layout

```
.
├─ package.json            # plugin manifest (repo root = plugin package)
├─ cordis.patch.yml        # bundle patch that mounts the plugin
├─ lib/
│  ├─ index.js             # host half (no-op)
│  └─ client.js            # browser half: injects the translucent CSS
├─ windows-acrylic/        # window-material patcher (Windows)
│  ├─ apply-acrylic.ps1
│  ├─ restore-asar.ps1
│  ├─ make-acrylic.mjs
│  └─ asar-state.mjs
└─ scripts/
   ├─ install-plugin.mjs
   └─ uninstall-plugin.mjs
```

`backups/` and `build/` are runtime output and are git-ignored.

---

## License

[MIT](LICENSE) © JianHeShui
