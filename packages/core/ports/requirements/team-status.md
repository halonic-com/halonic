# ports.team-status

- Status: active
- Since: unreleased
- Source: phase 2 architecture note, section 1.3 (HAL-17511), approved with the phase 2 card by the board on HAL-17544 (24 Nov); security notes HAL-17513 and HAL-17540; task HAL-17623

The ports package shall have a `TeamStatus` port, version 1, through which Studio's Team screens read the parts each source serves, spend per source and per agent for today, the week or the month, seats with their usage windows, pull requests with their timeline, and the merge queue, and hear which source changed. The port shall have no write of any kind. Every answer shall name its source with the same opaque IDs as `AgentMessaging`, and every spend summary, seat, pull request list, pull request detail and merge queue shall say as of when the source made it. A seat shall be named by its label only, with no account, login folder or connection.

## Examples

- Given the `TeamStatus` port,
  when its members are read,
  then they are exactly the reads and `changes`, and none of them writes.
- Given a `Seat` with an `account`, `configDir` or `connectionId` field,
  when it is compiled,
  then it doesn't compile.
- Given a `Seat` without `asOf`,
  when it is compiled,
  then it doesn't compile.
