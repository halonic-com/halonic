# runs.app-list-time

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), PR 3 (the Runs list's time on the kit formatter, HAL-19536 item 4); built on HAL-19765

The Runs app's list shall write a finished run's start, at the end of its title line, with the kit's short time in the window's time format and the user's time zone. Under a day's heading it shall show the time alone, since the heading says the day. In a group that isn't a day, such as Failed, a run from an earlier day shall show its day ("Yesterday", "Mon") instead.

## Examples

- Given a run that started at 08:00 UTC and finished, for a user in Europe/Madrid with the en-US format,
  when the list shows,
  then its row ends its title line with "9:00 AM".
- Given a run that failed yesterday and hasn't been opened,
  when the list shows it under Failed,
  then its row ends its title line with "Yesterday".
