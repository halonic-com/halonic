# Decision: the focused apps' windows get the app page's commands

- Task: HAL-17903
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17903 (Liam, reviewer of `src-tauri` and the capabilities)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:CcORqJaLcqJF6ZUMG+ItHAN8upHwUhaKfWgEY2qBJKJYZa0EqrgZh4aNotBVHV1xOqT+J8CUDfV4SoAa5frkDg==

## What changes

Halonic Inbox and Halonic Messenger open as their own windows of the one Halonic process
(`studio.src-tauri.focused-apps`), labelled `inbox` and `messenger`. They load the app's own local
page, `studio.html`, the same page as Studio's `main` window. So every desktop capability that
granted the app page's commands to `main` now grants them to `["main", "inbox", "messenger"]`.
The capability tests that compared `windows` with `["main"]` now compare it with those three labels.

Nothing else changes. Each capability stays `local`, with the same permissions and platforms, and
the served Studio still gets no command (`served-page`). The phone-only capabilities stay on
`main`. Where a requirement says the commands go to "the app's own main window", it means the app's
own local page as opposed to the Studio the computer serves. The focused apps' windows show that
same page, so no requirement text changes.

No test is skipped or deleted, and no assertion is dropped.

## Why

The board's direction (HAL-17358) is one install with Studio plus focused apps that share
Studio's connection and cache. A focused app runs the same page, so it needs the same commands.
A second process per app with its own `main` window would have kept the labels. But it would
also have run its own engine connection, engine lock and Paperclip polling, next to Studio's.

## Covers

- apps/studio/src-tauri/src/google_setups_tests.rs
- apps/studio/src-tauri/src/plugin_folder_remove_tests.rs
- apps/studio/src-tauri/src/plugin_folder_tests.rs
- apps/studio/src-tauri/src/sandbox_backup.rs
- apps/studio/src-tauri/src/sandbox_elevate.rs
- apps/studio/src-tauri/src/sandbox_wsl_setup.rs
- apps/studio/src-tauri/src/served_page_tests.rs
- apps/studio/src-tauri/src/served_page_tests/engine.rs
- apps/studio/src-tauri/src/served_page_tests/engine_lock.rs
- apps/studio/src-tauri/src/served_page_tests/runs.rs
- apps/studio/src-tauri/src/served_page_tests/trust.rs
- apps/studio/src-tauri/src/served_page_tests/updates.rs
- apps/studio/src-tauri/src/workspace_key_tests.rs
