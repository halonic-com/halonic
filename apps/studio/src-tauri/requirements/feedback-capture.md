# studio.src-tauri.feedback-capture

- Status: draft
- Since: unreleased
- Source: HAL-18778, HAL-18563 (board request on HAL-10, 25 Nov); sketch on HAL-18562; the screens in `studio.feedback.*`

When the feedback shortcut is pressed, the shell shall take one still of every screen, in memory only, and open one borderless, always-on-top overlay window on each. Only that press shall start a capture: no command takes one. While overlays are open, a second press shall close them and drop the stills. An overlay window shall get only its own screen's still through `plugin:feedback|still`. When it hands a box to `plugin:feedback|select`, the shell shall keep only the crop of that box, drop every still, close the overlays and open the Send feedback window, which shall get only the crop through `plugin:feedback|crop`. `plugin:feedback|end` shall drop everything held. Two minutes after the press without a selection, the shell shall drop that press's stills and close its overlays, and leave a later press's alone. An overlay closed any other way, such as Alt+F4, shall drop every still, and the Send feedback window closed any other way shall drop the crop. A box shall be whole numbers from zero up; one that is empty or reaches outside its overlay's still shall keep nothing. A still that is gone shall be refused as `gone`, and a window that isn't an overlay shall be refused as `not_an_overlay`.

The shortcut shall be Ctrl+Alt+F, ⌘⌥F on macOS, unless the host setting `feedback.shortcut` names another. Studio's window shall change it only through `plugin:feedback|shortcut_set`, which shall register the new keys before it lets go of the old ones and only then save them, keep the same keys as they are without registering them again, and shall refuse as `invalid` what isn't a shortcut, as `taken` keys the system or another app holds, and as `unavailable` where Studio hears no keys. The global-shortcut plugin shall be registered from Rust only, with no capability granting its commands. The served Studio, and every window but the ones named, shall get none of these commands.

## Examples

- Given two screens,
  when the person presses Ctrl+Alt+F,
  then each screen shows an overlay, and each overlay gets only its own screen's still.
- Given open overlays,
  when the second screen's overlay hands a box of 640 × 330 at (10, 20),
  then the overlays close, the Send feedback window opens and gets a 640 × 330 crop, and no still is held.
- Given a held still taken two minutes ago,
  when an overlay asks for it,
  then it is refused as `gone`.
- Given an overlay,
  when it hands a box with a width of -1 or 2.5,
  then it is refused and nothing is cropped.
- Given open overlays,
  when the person closes one with Alt+F4,
  then no still is held.
- Given Studio's window,
  when it calls `plugin:feedback|still`,
  then it is refused.
- Given Studio's window,
  when it sets the shortcut `Ctrl+Shift+F` and another app holds it,
  then it is refused as `taken` and Ctrl+Alt+F keeps working.
