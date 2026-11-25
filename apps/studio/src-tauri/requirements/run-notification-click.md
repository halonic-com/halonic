# studio.src-tauri.run-notification-click

- Status: draft
- Since: unreleased
- Source: HAL-18844, the click of `runs.run-notifications` (HAL-18776); Liam's review of halonic#6181

When the person clicks a desktop notification whose extra data names a non-empty `messagingId` with the kind `run` or `runs-failed`, the shell shall bring Studio's window forward, or open it when it is closed, and send that window the event `notification-clicked` with `{ messagingId, kind }`, and send it to no focused app's window, since only Studio's window shows Runs until the Runs window exists.

## Examples

- Given Studio's, Inbox's and Messenger's windows open,
  when the person clicks a notification with `{ "messagingId": "run-acme-7", "kind": "run" }`,
  then only Studio's window gets `notification-clicked`.
- Given only Inbox's window open,
  when the person clicks a notification with the kind `runs-failed`,
  then Studio's window opens.
