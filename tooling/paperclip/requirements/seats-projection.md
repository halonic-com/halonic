# paperclip.seats-projection

- Status: active
- Since: unreleased
- Source: HAL-16008; burn-rate and reset projections in the supervision plugins plan on HAL-15997 (phase 3)

When the `seats` plugin projects a seat's limit window, it shall use only the readings since the window's last reset, give no rate for readings less than 30 minutes apart, count a window whose reset has passed as unused, and name the time it reaches 100% only when that comes before its reset.

## Examples

- Given readings of 20% and 40% two hours apart and a reset ten hours later,
  when it is projected,
  then it uses 10% an hour and is full in eight hours.
- Given the same readings and a reset in three hours,
  when it is projected,
  then it has no full time.
- Given a reading of 80% before a reset and 5% after it,
  when it is projected,
  then only the reading after the reset counts.
- Given a newest reading whose reset has passed,
  when it is projected,
  then it is at 0% with no rate.
