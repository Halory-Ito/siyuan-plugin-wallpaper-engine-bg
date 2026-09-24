# Wallpaper Engine Background (SiYuan Plugin)

<p align="center">
  <img src="./cover.jpg" alt="Wallpaper Engine wallpaper as the SiYuan background" width="720">
</p>

Show **Wallpaper Engine** wallpapers (video / web / image) as the background of SiYuan,
plus an adjustable **mask** layer: tune the **brightness (mask opacity)** and **background blur**
with live sliders while keeping your notes readable.

中文: [README.md](./README.md)

## Features

- Reads your local Wallpaper Engine library (Steam workshop + local projects), no upload needed
  - Auto detects Steam libraries (parses `libraryfolders.vdf`; extra drives, Linux and macOS paths supported)
  - Or point it at any folder: `workshop/content/431960`, `431960`, or a single project folder all work
  - Loose media files (mp4 / webm / png / jpg / gif...) without `project.json` are supported too
- Wallpaper types
  | Wallpaper Engine type | Support |
  | --- | --- |
  | `video` (mp4 / webm...) | ✅ looped playback, volume, rate, pause when hidden |
  | `web` (html project) | ✅ served by a built-in local server so relative assets resolve |
  | `image` / loose images | ✅ static background |
  | `scene` / `application` | ⚠️ packed `.pkg` projects cannot run in the browser; `preview.jpg` is used instead |
- **Mask**: color (black to darken / white to lighten) + opacity = brightness control
- **Background blur**: 0–40px gaussian blur with automatic edge compensation
- Four fit modes: **Fit + blurred fill (default)** / cover / contain / stretch;
  the blurred fill uses a scaled blurred copy of the same media, so mismatched aspect ratios are never cropped into a close-up
- Brightness / saturation filters and position tuning
- **Surface background colors (panel transparency)**
  - Editor / document tree / outline / sidebar / toolbars / content and other panels each get their own background color and opacity
  - 0% opacity = fully transparent (overrides the opaque theme background so the wallpaper shows), 100% = opaque
  - Color can follow the theme background (adapts to SiYuan dark / light mode) or be custom (a separate dark-mode color is available)
  - Presets: soft glass (theme color at 60%) / all transparent / all opaque; the preset in effect is highlighted, and **All transparent is the default** (wallpaper fully visible)
- **Code block background (one-click palette)**
  - Its own section in the settings page with a swatch palette: transparent / follow theme / dark / slate / black / light gray / cream / white
  - Custom light + dark colors and an opacity slider for fine tuning; picking a swatch while opacity is 0% raises it to 85% so the change is visible
  - Inline code shares the same background
- **Minimal settings page**: grouped sections with hairline dividers (no cards or boxes), changes apply live,
  one-click restore to defaults; the defaults are a tuned configuration (transparent panels, 4px blur, 0.4 brightness, 2 saturation)
- Plus a whole-UI opacity mode (works with every theme) and an off switch
- Wallpaper library picker with thumbnails and type badges
- Random rotation, random on start, previous / next
- Wallpaper URL source (http/https video, image or web page) for browser frontends
- Quick adjust panel + top bar icon + commands (hotkey assignable), zh_CN / en_US UI

## Install

```bash
npm run build      # produces dist/
```

Copy `dist/` into your workspace plugin folder and rename it to `wallpaper-engine-bg`:

```text
<workspace>/data/plugins/wallpaper-engine-bg/
├── index.js
├── plugin.json
├── icon.png
├── preview.png
├── cover.jpg
└── i18n/
```

Restart SiYuan and enable the plugin.

## Usage

1. **Top bar icon**
   - Left click: quick adjust panel (mask opacity / blur / brightness / saturation / UI transparency + wallpaper nav)
   - Right click: library / random / toggle
2. **Settings (top bar right-click menu / plugin settings button)**
   - Minimal layout: General, Wallpaper source, Picture & mask, Backgrounds, Code block background, Playback, Misc
   - Wallpaper folders (empty = auto detect) → "Auto detect" → "Rescan" → "Pick wallpaper..."
   - Mask: enable, color, opacity (brightness)
   - Background blur, brightness, saturation
   - Backgrounds: mode (panel backgrounds / whole-UI opacity / off) + per-surface color and opacity + overall strength
   - Code block background: swatch palette + custom light / dark colors + opacity
   - Playback: mute / volume / rate / pause when hidden / mute web wallpapers
   - Rotation interval, random on start
3. **Command palette** (bind hotkeys in Settings → Hotkeys):
   toggle / quick panel / library / random / next / previous / darken / lighten / blur more / less

### Mask recipes

- Readable notes: black mask at 30%–60% opacity + 8–20px blur
- Bright and airy: white mask at 10%–30% opacity + 0–8px blur

## How it works

- The background layer (wallpaper + mask) is mounted under `<html>` (outside `<body>`),
  below every UI element and unaffected by UI transparency
- The wallpaper layer carries the `blur / brightness / saturate` filters; the mask is a plain color overlay
- The wallpaper layer carries the `blur / brightness / saturate` filters; the mask is a plain color overlay;
  in blurred-fill mode an extra blurred copy fills the background while the foreground uses `object-fit: contain`
- Surface backgrounds are applied with `background-color ... !important` on the matching structure
  (0% opacity still emits `transparent`, otherwise the opaque theme background remains).
  Selectors follow SiYuan's `app/src/assets/scss/business/_layout.scss`:
  content = `.layout-tab-container`, sidebar = `.layout__dockl/r/b`, tab bar = `.layout-tab-bar`, editor = `.protyle`.
  Nested elements inside the same surface are flattened to transparent so tints never stack up;
  theme colors emit `color-mix(...)` plus an rgba fallback so dark / light mode adapts automatically;
  custom colors emit rgba and may use a separate dark-mode color
- On desktop a tiny read-only static server is started on `127.0.0.1` (Node `http`):
  - loopback only, random secret in the URL, path traversal protected, serves only scanned wallpaper folders
  - lets web wallpaper relative js / css / textures load; videos support Range requests
  - injects a thin compatibility shim into html wallpapers (`window.wallpaperPropertyListener`,
    `wallpaperRegisterAudioListener`, ...) and can mute their audio
- Settings are stored in the plugin storage: display settings in `local.json` (syncs across devices),
  machine paths in `device-<hostname>.json` so devices never overwrite each other

## Limitations

- `scene` / `application` wallpapers are packed `.pkg` projects and fall back to their `preview.jpg`
- Web wallpaper audio is played by the page itself; the shim can only mute it best-effort
- Browser / mobile frontends have no Node access: use the wallpaper URL source instead
- Nested surfaces (document tree / outline inside the sidebar, editor inside the content area) stack on top of outer ones;
  the defaults are tuned so the stack looks like a single layer - set an inner one to 0% to keep it uniform

## Development

```bash
npm i
npm run build     # bundle to dist/
npm run watch     # rebuild on change
npm run smoke     # smoke test: scanning + local server + traversal guard
npx tsc --noEmit  # type check
```

## License

MIT
