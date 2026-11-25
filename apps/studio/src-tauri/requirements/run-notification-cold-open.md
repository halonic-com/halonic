# studio.src-tauri.run-notification-cold-open

- Status: draft
- Since: unreleased
- Source: HAL-18882, Liam's review of halonic#6217 (HAL-18844)

When the person clicks a desktop notification of the kind `run` or `runs-failed` while Studio's window is closed, the shell shall open Studio's window and keep the click, in place of any click kept before, instead of sending `notification-clicked`, and the command `take_pending_notification_click` shall return the kept `{ messagingId, kind }` once and clear it, so that a later call returns nothing. The shell shall keep no click of any other kind, and shall grant the command to Studio's window only, never to a focused app's window or to the Studio the computer serves.

## Examples

- Given only Inbox's window open,
  when the person clicks a notification with `{ "messagingId": "run-acme-7", "kind": "run" }`,
  then Studio's window opens and gets no `notification-clicked`,
  and `take_pending_notification_click` returns `{ "messagingId": "run-acme-7", "kind": "run" }`, then `null`.
- Given two clicks on run notifications while Studio's window is closed,
  then `take_pending_notification_click` returns only the second.
- Given a click of the kind `conversation` handed to the shell to keep,
  then `take_pending_notification_click` returns `null`.
