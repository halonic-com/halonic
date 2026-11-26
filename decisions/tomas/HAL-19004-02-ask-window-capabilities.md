# Decision: quick ask's box gets only the commands its page calls

- Approval: Liam approved the plan on HAL-19004 (https://paperclip.halonic.com/HAL/issues/HAL-19004), following up the reviews of #6271 on HAL-19003; Julian reviews the security and Liam signs this note in review
- Kind: internal

## What changes

When the box's window first landed (#6271), it loaded the same page and opened the same workspace as the Inbox and Messenger windows, so it got their 32 capabilities, including secrets and tokens, trust, sandbox elevation and the workspace key. That note said that once the box's page existed, its real calls could show that a narrower list is enough. The page below this PR (`studio.ask-box-window`) now starts only the box and the Messenger it asks through. Its test checks that the page calls `reopen_folder`, `host_settings_read`, `agent_host_request`, `show_main_window` and `plugin:quick-ask|hide`, and nothing else.

- **One capability names the `ask` window.** `desktop-quick-ask-box.json`, which replaces `desktop-quick-ask-window.json`, grants it exactly those five commands. None of the 32 shared capabilities names `ask` any more, `desktop-show-main-window.json` included, since the box's file grants that command.
- **The test reads every capability file in the folder.** It builds the set of permissions that reach `ask` (by name, or by any window pattern that could match it) and checks it equals those five, so a later capability that names `ask` fails it. A second test checks that `desktop-secrets`, `desktop-trust`, `desktop-sandbox-elevate` and `desktop-workspace-key` don't reach the box. Together they replace the old test, which checked only that the box's own file granted `plugin:quick-ask|hide`.
- **20 assertions in 16 test files drop `ask` from their window lists.** They checked that a capability goes to `main`, `inbox`, `messenger` and `ask`. Those capabilities now go to the first three, so each list loses `ask` and nothing else.
- **Two requirements change their wording:**
  - `studio.src-tauri.quick-ask-window` said the box "shall get the commands the focused apps' windows get, and nothing to read or change the keys". It now says the box shall get, from one capability that alone names the `ask` window, only the commands its page calls (`studio.ask-box-window`): those five. So it gets nothing to read or change the keys, and no secret, token, trust, sandbox or workspace key command.
  - `studio.src-tauri.focused-apps` said "The app windows shall be granted the same commands as Studio's window, except the `login_item_*` commands" and "Only the app windows shall be granted `show_main_window`". It now says that of the Inbox and Messenger windows. It adds that the box's window is granted only the commands its page calls, and that the box's window counts among the app windows granted `show_main_window`.
- **Trust is no weaker.** The box no longer runs the workspace's trust check, but nothing it calls needs it. The agent host's messaging serves only the workspaces the launcher named, and holds every key itself. Messaging checks no trust in the Messenger's window either, so the box can't do anything there that the Messenger can't. `reopen_folder` reopens only a folder the person already picked in Studio.
- **Open in Messenger:** `plugin:quick-ask|open_chat` doesn't exist in the shell yet. HAL-19097 adds it, and whichever of the two PRs merges second grants it to the box and adds it to the test's list.

## Covers

- studio.src-tauri.quick-ask-window
- studio.src-tauri.focused-apps
- apps/studio/src-tauri/capabilities/
- apps/studio/src-tauri/src/quick_ask_tests.rs
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
