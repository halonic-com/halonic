# Decision: quick ask may hear one more system-wide key and show its box over other apps

- Approval: the board approved quick ask on HAL-18594 (25 Nov); Liam approved the plan on HAL-18625 (https://paperclip.halonic.com/HAL/issues/HAL-18625), with this PR on its own task, HAL-18787; Julian reviews the security and Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:460qvte7+jHrvK0LbdBPRf+q/1RhOZptv6PiOwZ5ZE4HcT45a500WplFWAoGYhKKIa6N2I7N0XYG/GMNnM9lAw==

## What changes

Studio's desktop shell hears a second system-wide key, quick ask's (Ctrl+Alt+Space, ⌥Space on macOS). A press shows a new always-on-top window, the box, over whatever app has the focus.

- **No page can register a key or hear keys.** The keys are registered from Rust only, through the global-shortcut plugin the feedback shortcut brought in (HAL-18778). No capability grants the plugin's commands, and a test checks that none names it. The plugin's one handler now goes in `global_keys.rs`. It hands a press only to the one whose keys they are, quick ask or feedback, and ignores any other press. It never waits on a change of keys: a press while the keys change does nothing.
- **Nothing new is added.** No new crate, plugin or npm package. The plugin and its crates are the ones HAL-18778 approved.
- **The box is the app's own page in one more window, `ask`.** It's frameless, transparent, always on top and on every desktop space, with no taskbar entry, icon or Start menu shortcut. It shows on the screen the pointer is on. A second press, Esc, or a click in another app hides it; it's hidden, not closed. When every other window has closed and Halonic doesn't keep running in the tray, the box's window closes too, so a hidden box never keeps Halonic running with nothing showing.
- **The box gets the commands the Messenger and Inbox windows get, no more.** That's the capabilities' window lists with `ask` added (32 files, one line each), plus `show_main_window` for "Open Studio". It loads the same page and opens the same workspace as those windows, so it can't reach anything they can't. It also gets `plugin:quick-ask|hide`, which hides only the calling window and is refused from any other. Once the box's page exists (PR 2), its real calls can show that a narrower list is enough. That would be a follow-up.
- **Only Studio's window reads and changes the keys,** for Settings › Shortcuts:
  - `plugin:quick-ask|shortcut` says whether the keys work: `on`, `taken`, `wayland` or `unavailable`.
  - `plugin:quick-ask|shortcut_set` registers the new keys before it lets go of the old ones, then saves them in the host setting `quick-ask.shortcut`.
  - The box itself can't change its keys.
- **Linux with Wayland:** the desktop gives a key only to the focused window, so the shell doesn't register the keys there. It reports `wayland`, and the person adds a desktop shortcut that runs `halonic-studio --app ask`.
- **The tray menu gets Ask…**, so the box opens even where the keys don't work. That changes the tray's menu texts and their tests (the board card's menu plus one line), and the tray requirement says so.
- **A focused app's icon is optional now,** because the box has none. `app-icons.test.ts` still checks that Inbox and Messenger set theirs; it now reads the new `if let Some(icon) = app.icon()` form of that call.
- **macOS:** Tauri makes a window transparent there only with its private-API feature, which this PR doesn't turn on. So on macOS the margin around the box shows the page's background. Turning that feature on is Liam's call, in a later PR.

The box's own screen is PR 2 (HAL-18625). Settings › Shortcuts and Open in Messenger come in their own PRs. Until the page shows the box, this PR doesn't merge, so users don't see an empty window.

## Covers

- studio.src-tauri.quick-ask-window
- studio.src-tauri.tray
- studio.src-tauri.focused-apps
- apps/studio/src-tauri/capabilities/
- apps/studio/src-tauri/src/tray_status_tests.rs
- apps/studio/src-tauri/src/focused_apps.rs
- apps/studio/src-tauri/src/served_page_tests/
- apps/studio/src-tauri/src/frame_colour.rs
- apps/studio/src-tauri/src/google_setups_tests.rs
- apps/studio/src-tauri/src/plugin_folder_tests.rs
- apps/studio/src-tauri/src/plugin_folder_remove_tests.rs
- apps/studio/src-tauri/src/sandbox_backup.rs
- apps/studio/src-tauri/src/sandbox_elevate.rs
- apps/studio/src-tauri/src/sandbox_wsl_setup.rs
- apps/studio/src-tauri/src/workspace_key_tests.rs
- apps/studio/src/studio/app-icons.test.ts
