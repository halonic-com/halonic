# studio.app-icons

- Status: active
- Since: unreleased
- Source: HAL-20465 (the dark, all-blue set the board approved on 27 Nov 2026), built on HAL-20571; HAL-19183 (the taskbar set before it); HAL-18693 (board report on HAL-10: every app showed the same ring, without its own icon); the app logo set HAL-17379, approved with the Halonic apps card HAL-17358; the kit's `kit.app-logo`

On Windows (each `.ico` and each focused app's window icon) an icon shall be the app's icon from the dark, all-blue set the board approved: one line of light in Halonic blue on ink glass around a point of light in the centre of the square, with no tile, each size drawn on its own pixel grid. Halonic's `icon.png` and `icon.svg` (macOS and Linux) keep the slate tile with the brand ring and the glyph of the kit's `AppLogo`. Halonic's own icon (the exe, the installer and the Halonic shortcut) shall carry Studio's point of light. Each focused app's window shall carry its app's icon, and on Windows the installer shall install each focused app's icon (`icons\inbox.ico`, `icons\messenger.ico`) and give that app's Start menu shortcut that icon, so its Start menu entry and taskbar entry show the app's icon: a bell for Halonic Inbox, a ring with a speech tail for Halonic Messenger. Each `.ico` shall hold the sizes the set is drawn at, 16, 20, 24, 32, 40, 48, 64 and 256 px; a hand-tuned image of a size, when there is one, shall replace the drawn one.

## Examples

- Given Halonic installed on Windows,
  when Halonic Messenger is opened from the Start menu,
  then its Start menu entry, its window and its taskbar entry show the line of light in a ring with a speech tail around the point of light, and Halonic's own show the ring around the point of light.
- Given the Windows icon files,
  when they are compared with the approved set,
  then each is its app's dark, all-blue icon, without the kit's glyphs.
- Given `icon.svg`,
  when it is compared with the kit's glyphs,
  then it draws exactly Studio's glyph.
