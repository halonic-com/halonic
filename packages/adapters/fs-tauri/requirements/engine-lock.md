# fs-tauri.engine-lock

- Status: draft
- Since: 0.1.0
- Source: HAL-8792, decided on HAL-6602; `studio.src-tauri.engine-lock-commands`; `holdLock` in `fs-node`; `cli.local-engine-lock`

The Tauri engine lock shall hold the workspace's one engine lock by calling the shell's `engine_lock_hold` with the workspace exactly as it was opened, never a subfolder of it, and an open channel for the loss of the lock, and shall give back a lock whose `release` calls `engine_lock_release` and closes the channel. When the shell sends on the channel, because another process took the lock over, it shall call `onLost` once with an error, so the host closes the engine as `openLocalEngine` does. A refusal shall reject as a `conflict` error with the shell's message when another engine holds the lock, as `denied` for a workspace that isn't open and as `unavailable` for the rest; a rejection that isn't the shell's refusal, such as a page without the capability, shall reject as `unavailable` without the shell's text. A refused hold shall leave no channel open.

## Examples

- Given an opened workspace and no other engine,
  when the page holds the lock,
  then the shell holds it for this window and `release` gives it back.
- Given a held lock and another process that takes it over,
  when the shell tells the page,
  then `onLost` is called once with an error and the channel is closed.
- Given the CLI's engine holds the lock,
  when the page holds it,
  then it rejects as `conflict` and no channel stays open.
- Given a page that reloads,
  when the new page holds the lock for the same workspace,
  then it succeeds and the new page, not the old one, hears of a loss.
- Given a workspace the person didn't open,
  when the page holds the lock,
  then it rejects as `denied`.
- Given a page without the capability,
  when it holds the lock,
  then it rejects as `unavailable` without the shell's text.
