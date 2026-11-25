# paperclip.amsterdam-time

- Status: active
- Since: unreleased
- Source: HAL-18903, the board's rule of 25 Nov: every time written for people is Amsterdam time with the zone named; UTC stays only in machine fields, logs and code

When the Agent tools plugin writes a time into text for people (the board check's comments and documents, `board_asks`, `failed_runs`, `merge_speed`, `pr_status`, `queue_state` and the PR watcher's review-wait note), it shall write it as Amsterdam time with its day, month, hour, minute and zone name (`CET` or `CEST`), from the `Europe/Amsterdam` time zone so that daylight saving time is followed rather than a fixed offset, and shall keep times in UTC in tool data, plugin state and logs; a value that isn't a time shall be written as it is.

## Examples

- Given a todo with no owner since `2026-11-24T09:00:00Z`,
  when the board check wakes Chief,
  then the comment says "no owner since 24 Nov 10:00 CET".
- Given a time of `2026-07-01T15:40:00Z`,
  when the plugin writes it for people,
  then it reads "1 Jul 17:40 CEST".
- Given `2026-10-25T00:30:00Z` and `2026-10-25T01:30:00Z`, either side of the switch back to winter time,
  when the plugin writes them,
  then both read 02:30, the first "CEST" and the second "CET".
