# studio.src-tauri.quick-ask-window

- Status: draft
- Since: unreleased
- Source: HAL-18787, plan on HAL-18625; design HAL-18594 (sections 4–5, approved by the board on 25 Nov); the box's page in `studio.quick-ask.*`

When quick ask's keys are pressed, the tray's Ask… is picked, or Halonic is started with `--app ask`, the shell shall show the box: one frameless, transparent, always-on-top window on the app's own page, labelled `ask`, with no taskbar entry and no Start menu shortcut, placed on the screen the pointer is on, else the main screen, centred, with the 640 px box's top edge at 18% of the screen's height and 32 px around the box for its shadow, taking the screen's width on a screen narrower than that and ending at the screen's bottom on a short one. It shall open that window once and show it again after that. A press while the box shows with the focus, `plugin:quick-ask|hide` from the box, or another app taking the focus shall hide it, not close it. Only the `ask` window shall get `plugin:quick-ask|hide`, refused as `not_the_box` from any other; it shall get the commands the focused apps' windows get, and nothing to read or change the keys. When every other window has closed and Halonic doesn't keep running in the tray, the shell shall close the box's window too.

The keys shall be Ctrl+Alt+Space, ⌥Space on macOS, unless the host setting `quick-ask.shortcut` names others, registered at start from Rust only, through the global-shortcut plugin the feedback shortcut shares, with no capability granting that plugin's commands; a press shall go only to the one whose keys they are. Studio's window, and no other, shall read the keys and whether they work through `plugin:quick-ask|shortcut` (`on`, `taken` when the system or another app holds them, `wayland` on Linux with Wayland, which lets no app take a key for the whole screen, so the shell doesn't register them there, and `unavailable` where Studio hears no keys) and change them through `plugin:quick-ask|shortcut_set`, which shall register the new keys before it lets go of the old ones and only then save them, keep the same keys as they are, and refuse as `invalid` what isn't a shortcut, as `wayland`, `unavailable` and `taken` as above. The served Studio shall get none of these commands.

## Examples

- Given Halonic running in the tray with Studio's window closed,
  when the person presses Ctrl+Alt+Space over another app,
  then the box shows over it, at the top third of the screen the pointer is on, with the focus.
- Given a 1920 × 1080 screen at scale 1,
  when the box shows,
  then its window is 704 × 560 at (608, 162).
- Given the box showing,
  when the person clicks in another app,
  then the box hides, and the next press shows the same window again.
- Given Studio's window,
  when it calls `plugin:quick-ask|hide`,
  then it is refused as `not_the_box`.
- Given another app holding Ctrl+Alt+Space,
  when Halonic starts,
  then `plugin:quick-ask|shortcut` says `taken`, and the tray's Ask… still shows the box.
- Given Linux with Wayland,
  when Studio's window sets new keys,
  then it is refused as `wayland`, and `halonic-studio --app ask` still shows the box.
