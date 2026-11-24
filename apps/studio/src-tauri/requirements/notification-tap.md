# studio.src-tauri.notification-tap

- Status: draft
- Since: unreleased
- Source: HAL-17458, part of HAL-17422 (Phase 1, desktop notifications)

When the notification plugin reports a click on the body of one of the Studio's desktop notifications, the shell shall handle it as `studio.src-tauri.notification-click` does, and shall send along the item's non-empty `kind` from the notification's extra data, unread, when it names one. A click on one of a notification's buttons shall send nothing.

## Examples

- Given a notification with the extra data `{ "messagingId": "chat-acme-2", "kind": "conversation" }`,
  when the person clicks it,
  then the app window gets `notification-clicked` with `{ "messagingId": "chat-acme-2", "kind": "conversation" }`.
