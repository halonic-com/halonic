# studio.src-tauri.feedback-capture

- Status: draft
- Since: unreleased
- Source: HAL-18778, in-window rework from the board (26 Nov), HAL-18563 (board request on HAL-10, 25 Nov); sketch on HAL-18562; the screens in `studio.feedback.*`

When one of Studio's own windows (Studio, Halonic Inbox, Halonic Messenger) calls `plugin:feedback|start` after the person pressed the feedback shortcut in it, the shell shall take one still of that window's own area, inside its frame, in memory only, and answer the still's width and height in device pixels. No system-wide key shall be registered: the shortcut is heard only by the focused window. When that window hands a box to `plugin:feedback|select`, the shell shall keep only the crop of that box, drop the still and open the Send feedback window, which shall get only the crop through `plugin:feedback|crop`. `plugin:feedback|end` shall drop everything held. Two minutes after the press without a selection, the shell shall drop that press's still and leave a later press's alone. The Send feedback window closed any other way shall drop the crop. A box shall be whole numbers from zero up; one that is empty or reaches outside the still shall keep nothing. A still that is gone shall be refused as `gone`, and any other window shall be refused as `not_a_studio_window`.

The shortcut shall be Ctrl+Shift+F, ⌘⇧F on macOS, unless the host setting `feedback.shortcut` names another. Studio's main window shall change it only through `plugin:feedback|shortcut_set`, which shall check it and save it, and shall refuse as `invalid` what isn't a shortcut. The global-shortcut plugin shall not be added to the app. The served Studio, and every window but the ones named, shall get none of these commands.

## Examples

- Given Studio's window of 1200 × 800 CSS pixels at scale 1.5,
  when the person presses Ctrl+Shift+F in it,
  then `plugin:feedback|start` answers width 1800 and height 1200, and only that window's area is held.
- Given a held still,
  when the window hands a box of 640 × 330 at (10, 20),
  then the Send feedback window opens and gets a 640 × 330 crop, and no still is held.
- Given a held still taken two minutes ago,
  when the window hands a box,
  then it is refused as `gone`.
- Given Studio's window,
  when it hands a box with a width of -1 or 2.5,
  then it is refused and nothing is cropped.
- Given the Send feedback window,
  when it calls `plugin:feedback|start`,
  then it is refused.
