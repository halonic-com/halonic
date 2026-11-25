# Decision: the feedback shortcut may read the screen, only on its key press

- Approval: the board asked for the feedback shortcut on HAL-10 (HAL-18563); Liam approved the plan and the plugin on HAL-18781 (https://paperclip.halonic.com/HAL/issues/HAL-18781); Julian reviews the security and Liam signs this note in review
- Kind: internal

## What changes

Studio's desktop shell gets two new powers. It can read the screen, and it can hear one system-wide key, the feedback shortcut (Ctrl+Alt+F, ⌘⌥F on macOS).

- **Only the key press starts a capture.** No command takes one, so no page can read the screen when it likes. The press takes one still of every screen, in memory only, never in a file.
- **The full still goes only to the overlay windows.** Each overlay window (`feedback-overlay-<n>`) gets only its own screen's still. When the person draws a box, the shell keeps only the crop of that box and drops every still.
- **Only the crop goes on.** The Send feedback window (`feedback`) gets only the crop. Esc, Cancel or a second press drops everything. Two minutes without a box drops that press's stills and closes its overlays, on a timer. An overlay closed any other way, such as Alt+F4, drops the stills too.
- **Each window gets only its own commands, and the served Studio gets none.** The three new capabilities are local only, and each names its windows. Studio's own window may only change the shortcut.
- **No page can register a key or hear keys.** The global-shortcut plugin is registered from Rust only, and no capability grants its commands. It reports presses of the one key the shell registers, and nothing else.
- **The plugin is new.** It's `tauri-plugin-global-shortcut =2.4.1`, Tauri's own, pinned with tauri. It adds `global-hotkey` and `keyboard-types 0.7` everywhere, and on Linux only `x11rb`, `x11rb-protocol`, `xkeysym` and `gethostname`. All of them are MIT or Apache-2.0. It's a Cargo crate only: no page calls it, so there's no npm package and no `tooling/check/dependencies.json` entry.
- **The screen is read by a new crate, `halonic-screen-still`, with no new code from outside.**
  - **Windows:** GDI, through the `windows` crate already in the build.
  - **Linux:** X11, through `x11rb`, which the plugin brings. Wayland is refused as unavailable.
  - **macOS:** not yet. CoreGraphics' capture is obsolete from macOS 15 on, so macOS is refused as unavailable, like Wayland, until a ScreenCaptureKit change.
  - Its `unsafe` stays inside the Windows module, and every block has a `// SAFETY:` comment.
- **Nothing registers the shortcut at start yet.** That comes with the overlay's page in the next PR, so nothing a user sees changes here.

## Covers

- studio.src-tauri.feedback-capture
