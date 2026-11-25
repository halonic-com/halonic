# runtime.amsterdam-time

- Status: active
- Since: unreleased
- Source: HAL-18903, the board's rule of 25 Nov: every time written for people is Amsterdam time with the zone named; UTC stays only in machine fields, logs and code

When a tool's text for people names a time, the runtime shall write it as Amsterdam time with its day, month, hour, minute and zone name (`CET` or `CEST`), from the `Europe/Amsterdam` time zone so that daylight saving time is followed rather than a fixed offset, and shall keep the time in UTC in the tool's data; a value that isn't a time shall be written as it is.

## Examples

- Given the newest review finding on a pull request's head at `2026-11-26T15:05:00Z`,
  when an agent calls `pr_status`,
  then the text says "at 26 Nov 16:05 CET" and the data keeps `2026-11-26T15:05:00Z`.
- Given a time of `2026-07-01T15:40:00Z`,
  when a tool writes it for people,
  then it reads "1 Jul 17:40 CEST".
- Given `2026-10-25T00:30:00Z` and `2026-10-25T01:30:00Z`, either side of the switch back to winter time,
  when a tool writes them,
  then both read 02:30, the first "CEST" and the second "CET".
