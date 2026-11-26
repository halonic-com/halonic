# kit.time-stamp-zone

- Status: active
- Since: unreleased
- Source: Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), PR 3: Team and Runs, which show times in a chosen time zone, use the kit's short time; built on HAL-19765

Where `shortTime` is given a time zone, it shall pick today, yesterday, the weekday or the date, and write the time, in that time zone instead of the computer's own.

## Examples

- Given 23:30 UTC on 25 Nov, now 09:00 UTC on 26 Nov, and the zone "Asia/Tokyo",
  when the short time is written in en-GB,
  then it reads "08:30", because both are on 26 Nov in Tokyo.
- Given the same times and the zone "UTC",
  when the short time is written in en-GB,
  then it reads "Yesterday".
