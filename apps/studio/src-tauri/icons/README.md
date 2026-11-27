# Studio's icons

The app icons are not edited by hand: `draw-app-icons.mjs` draws them; after a drawing changes, run its three
steps (Chromium draws the pixels; the script's first lines say how). `src/studio/app-icons.test.ts` fails while
the files hold another drawing.

- Windows' icons are the dark, all-blue set the board approved on HAL-20465: one line of light in Halonic blue on
  ink glass around a point of light in the centre of the square. `dark-blue-icons.mjs` draws all seven apps
  (Studio, Messenger, Inbox, Workspaces, Code, Runs, Ask), ported from the designer's `icons-v4.mjs` so its SVGs
  come out the same to the byte. Each size is drawn on its own pixel grid, so never scale one size to make
  another; the glow starts at 32 px. Each .ico holds 16, 20, 24, 32, 40, 48, 64 and 256 px.
- `tuned/<app>-<pixels>.png` (optional, `<app>` is `studio`, `inbox` or `messenger`): a hand-tuned image. The
  script puts it in the .ico in place of the drawn one. There is none for the current set.
- `icon.ico`, Halonic's own icon, Studio's point of light, which the exe, the installer and the Halonic shortcut
  carry. `icon.png` (512 px) and `icon.svg`, its source, keep Noah's approved tile (HAL-17379): the slate tile,
  the brand ring (16% of the diameter, blue to cyan) and the kit's glyph
  (`packages/studio/kit/src/app-logo/app-glyphs.ts`, which the Studio's `AppLogo` draws too), glowing. `tauri.conf.json` points at
  `icon.png` and `icon.ico`.
- `apps/<app>.ico` and `apps/<app>.svg` (the 256 px drawing) for each focused app (Inbox, Messenger): the
  installer installs the .ico as `icons\<app>.ico` and gives the app's Start menu shortcut that icon, so its
  taskbar entry shows it too. `apps/<app>.rgba` is its window's icon, 64 by 64 raw RGBA, so it stays sharp at
  high display scaling.
- Android's launcher icon is in `../gen/android/app/src/main/res`: three vector layers (`drawable/ic_launcher_*.xml`,
  the last one the single-colour themed icon), tied together in `mipmap-anydpi-v26/ic_launcher.xml`, and plain
  PNGs for Android 7.0 and 7.1. Don't regenerate them with `pnpm tauri icon`: it would put back a flat picture
  without the themed layer.
- The GitHub social preview isn't kept here: GitHub only takes an upload in the repository's Settings, so the image
  lives in `brand/dist/social-preview.png` in halonic-com/website.

- `tray/` (B1 step 5, HAL-14220): the tray icon, the ring with the state in its centre (`idle`, `running`,
  `paused`, `problem`), 32 by 32 raw RGBA, so the shell needs no image decoder. `colour-*` for Windows and KDE,
  `template-*` for the macOS menu bar, `symbolic-*` (white) for GNOME. They are Noah's drawings (HAL-14222,
  HAL-14253): `glyph.js` in the source zip on HAL-14253 draws each one at 32 px, which is screenshotted on a
  transparent background and stored as RGBA.

The ring itself, with the master SVGs and the rules for using the logo, is `brand/` in halonic-com/website; the
Android icons and the tray icons are copied from there.
