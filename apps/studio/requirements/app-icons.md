# studio.app-icons

- Status: active
- Since: unreleased
- Source: HAL-19183 (the taskbar set the board approved, with the rounder envelope); HAL-18693 (board report on HAL-10: every app showed the same ring, without its own icon); the app logo set HAL-17379, approved with the Halonic apps card HAL-17358; the kit's `kit.app-logo`

The native icons of Halonic shall be the approved app logos, drawn from the same glyphs as the kit's `AppLogo`. On Windows (each `.ico` and each focused app's window icon) an icon shall have no tile: the brand ring's outer edge on the icon's edge, a navy centre and the app's glyph at the same share of the ring's hole for every size, so the three apps look equally big. Halonic's `icon.png` and `icon.svg` keep the slate tile with the brand ring and the glyph. Halonic's own icon (the exe, the installer and the Halonic shortcut) shall carry Studio's point of light. Each focused app's window shall carry its app's icon, and on Windows the installer shall install each focused app's icon (`icons\inbox.ico`, `icons\messenger.ico`) and give that app's Start menu shortcut that icon, so its Start menu entry and taskbar entry show the app's glyph: an envelope for Halonic Inbox, a message bubble for Halonic Messenger. Each `.ico` shall hold the sizes 16, 20, 24, 30, 32, 36, 40, 48, 64 and 256 px, every size Windows asks for at 100, 125, 150 and 200% display scaling; a hand-tuned image of a size, when there is one, shall replace the drawn one.

## Examples

- Given Halonic installed on Windows,
  when Halonic Messenger is opened from the Start menu,
  then its Start menu entry, its window and its taskbar entry show the ring with a message bubble, and Halonic's own show the ring with its point of light.
- Given the icon files,
  when they are compared with the kit's glyphs,
  then each draws exactly its app's glyph.
