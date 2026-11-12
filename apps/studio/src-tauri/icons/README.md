# Studio's icons

The Halonic logo is the ring from halonic.dev: a stroke of 12% of the diameter, blue to teal. These files are
drawn from it, and are not edited by hand.

- `icon.ico` (16, 24, 32, 48, 64 and 256 px) and `icon.png` (512 px): the Windows icon, the bare ring on a
  transparent square. `icon.svg` is its source. `tauri.conf.json` points at the first two.
- Android's launcher icon is in `../gen/android/app/src/main/res`: three vector layers (`drawable/ic_launcher_*.xml`,
  the last one the single-colour themed icon), tied together in `mipmap-anydpi-v26/ic_launcher.xml`, and plain
  PNGs for Android 7.0 and 7.1. Don't regenerate them with `pnpm tauri icon`: it would put back a flat picture
  without the themed layer.
- The GitHub social preview is `.github/social-preview.png`.

The script that draws all of them, with the master SVGs and the rules for using the logo, is `brand/` in
halonic-com/website. Change the logo there, then copy the new files here.
