# services.agent-quiet-hours

- Status: active
- Since: unreleased
- Source: HAL-17449; HAL-17422 plan, approved by the board on HAL-10 (24 Nov): quiet hours set in Settings, then one summary.

While quiet hours set in Settings are on, the Studio shall show no notification from `services.agent-notifications`, and shall count each one it holds back. When the quiet hours end, the Studio shall show one summary notification with that count, such as "3 new", and none if nothing came in. Outside quiet hours, each notification shall show at once.

## Examples

- Given quiet hours from 22:00 to 07:00,
  when three new cards come in at 23:00,
  then no notification shows, and at 07:00 one notification "3 new" shows.
- Given quiet hours from 22:00 to 07:00,
  when a new card comes in at 12:00,
  then its notification shows at once.
