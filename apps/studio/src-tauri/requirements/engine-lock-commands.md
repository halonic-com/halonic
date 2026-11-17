# studio.src-tauri.engine-lock-commands

- Status: draft
- Since: unreleased
- Source: HAL-8792, decided on HAL-6602; `holdLock` in `fs-node`; `cli.local-engine-lock`

When the page calls `engine_lock_hold` for a workspace, the shell shall hold `engine.lock` in the workspace's folder in the profile, the file the CLI's engine holds, in the same format and with the same stale takeover, so the CLI and the Studio never both run an engine on one workspace. If another engine holds it, the shell shall refuse the call as `conflict` with the other process's id. The shell, not the page, shall hold the lock, for as long as the app runs, keyed by the window that asked, and shall renew it so it never counts as stale: a call from the window that holds it already, as a reloaded page makes, shall succeed and keep the lock, and a lock the window lost to another process shall be taken again. The shell shall release the lock when the page calls `engine_lock_release`, when the window closes and when the app quits. The page shall name a workspace it opened and never a path; any other workspace shall be refused as `folder_not_open`, before the shell makes a folder or a lock.

## Examples

- Given the opened workspace `acme` with no engine,
  when the page calls `engine_lock_hold`,
  then `engine.lock` in `acme`'s folder in the profile holds this process's record, and `engine_lock_release` removes it.
- Given a page that holds the lock and reloads,
  when the new page calls `engine_lock_hold` from the same window,
  then it succeeds and the lock is the one it held before.
- Given the CLI's engine, a live process, holds `engine.lock`,
  when the page calls `engine_lock_hold`,
  then it is refused as `conflict` and the file is untouched.
- Given a second window,
  when it calls `engine_lock_hold` for the workspace the first window holds,
  then it is refused as `conflict`.
- Given an `engine.lock` whose process has ended,
  when the page calls `engine_lock_hold`,
  then the shell takes the lock over.
- Given a window that holds the lock,
  when the window closes or the app quits,
  then the lock is removed.
- Given a workspace the person didn't open,
  when the page calls `engine_lock_hold`,
  then it is refused as `folder_not_open`.
