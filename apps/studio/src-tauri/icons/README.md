# Studio's icons

The app icons are Noah's approved set (HAL-17379, the Halonic apps card HAL-17358): the slate tile, the brand
ring (16% of the diameter, blue to cyan) and each app's glyph where the point of light sits, grown under 48 px.
`draw-app-icons.mjs` draws them from the kit's glyphs (`packages/studio/kit/src/app-logo/app-glyphs.ts`), the
same ones the Studio's `AppLogo` draws, so they are not edited by hand (HAL-18693). After a glyph changes, run
its three steps (Chromium draws the pixels; the script's first lines say how). `src/studio/app-icons.test.ts`
fails while the files draw another glyph than the kit's.

- `icon.ico` (16, 24, 32, 48, 64 and 256 px), `icon.png` (512 px) and `icon.svg`, their source: Halonic's own
  icon, Studio's point of light, which the exe, the installer and the Halonic shortcut carry. `tauri.conf.json`
  points at the first two.
- `apps/<app>.ico` and `apps/<app>.svg` for each focused app (Inbox, Messenger): the installer installs the .ico
  as `icons\<app>.ico` and gives the app's Start menu shortcut that icon, so its taskbar entry shows it too.
  `apps/<app>.rgba` is its window's icon, 64 by 64 raw RGBA, so it stays sharp at high display scaling.
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
