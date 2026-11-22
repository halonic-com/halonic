# paperclip.merge-speed-tool

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 3 (22 Nov)

When an agent calls `merge_speed(hours)`, the Agent tools plugin shall answer from the PR watcher's last GitHub snapshot and the queue exits the board check kept, without a GitHub request, with the merges, merges per hour, the share of queue exits dropped without merging, and the median and longest time in the queue of the merged ones, for the last 6 hours or the whole hours asked from 1 to 168, naming the snapshot's time, whether it is older than 30 minutes and since when exits count; and with an error before the first snapshot or for hours outside that range.

## Examples

- Given a 14:55 snapshot with one merge at 14:00 and four merged exits of 60 minutes counted since 08:00,
  when an agent calls `merge_speed` with hours 2 at 15:00,
  then it answers "Merges: 1 (0.5 per hour)", "0% of 4 exits" dropped and a median of 60 minutes, counted since 08:00.
- Given no snapshot yet,
  when an agent calls `merge_speed`,
  then it answers with an error saying there are no figures yet.
- Given hours 0,
  when an agent calls `merge_speed`,
  then it answers with an error naming the range 1 to 168.
