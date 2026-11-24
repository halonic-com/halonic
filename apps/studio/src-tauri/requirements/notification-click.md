# studio.src-tauri.notification-click

- Status: draft
- Since: unreleased
- Source: HAL-17500, part of HAL-17422 (Phase 1, desktop notifications)

When the person clicks one of the Studio's desktop notifications whose extra data names an item as a non-empty `messagingId`, the shell shall send the app window the event `notification-clicked` with `{ messagingId }`, and do nothing else with it. A notification without an item shall send nothing.

## Examples

- Given a notification with the extra data `{ "messagingId": "item-acme-7" }`,
  when the person clicks it,
  then the app window gets `notification-clicked` with `{ "messagingId": "item-acme-7" }`.
- Given a notification without a `messagingId`,
  when the person clicks it,
  then the app window gets nothing.
