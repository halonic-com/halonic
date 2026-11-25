# Studio's icons

The Halonic logo is the ring from halonic.dev: a stroke of 12% of the diameter, blue to teal. These files are
drawn from it, and are not edited by hand.

- `icon.ico` (16, 24, 32, 48, 64 and 256 px) and `icon.png` (512 px): the Windows icon, the bare ring on a
  transparent square. `icon.svg` is its source. `tauri.conf.json` points at the first two.
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

The script that draws all of them, with the master SVGs and the rules for using the logo, is `brand/` in
halonic-com/website. Change the logo there, then copy the new files here.
