# kit.rail-button-count-cap

- Status: active
- Since: unreleased
- Source: HAL-20675; Julian's review of the rail button (#6850), the cap the kit's other counts use (`kit.plain-list`)

When a `RailButton`'s count is above 99, its badge shall show "99+". A screen reader shall still hear the count's own words after the button's name.

## Examples

- Given a RailButton "Messenger" with a count of 120 named "120 unread",
  when it renders,
  then its badge says "99+" and it is named "Messenger, 120 unread".
- Given a count of 99,
  when it renders,
  then its badge says "99".
