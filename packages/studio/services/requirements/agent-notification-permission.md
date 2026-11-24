# services.agent-notification-permission

- Status: active
- Since: unreleased
- Source: HAL-17458, part of HAL-17422 (Phase 1, desktop notifications); from the review of HAL-17448

When the person has said no to desktop notifications, the Studio shall show none, and shall ask again before the next notification after the window gets focus or after the Studio starts again. Once the person says yes, it shall not ask again while the Studio runs.

## Examples

- Given the person said no to notifications,
  when they allow them in the system's settings, come back to the Studio window and a new card comes in,
  then the Studio asks again and the notification shows.
- Given the person said no to notifications,
  when they start the Studio again and a new card comes in,
  then the Studio asks again.
