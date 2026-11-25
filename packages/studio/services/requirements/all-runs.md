# services.all-runs

- Status: active
- Since: unreleased
- Source: HAL-18749 (Runs app PR 6); Liam's decision on HAL-18748; plan HAL-18624, design revision 3 on HAL-18594, approved by the board on 25 Nov 14:48 UTC

The Studio shall read the Runs app's runs from every run source it is given, one per workspace and one per Paperclip team, and list them together, newest start first. While the Runs list is shown, the Studio shall read every source again every 30 seconds. When a source's read fails, the Studio shall keep that source's rows from its last good read, keep every other source's rows, and name that source and its error, until a read of that source works again.

## Examples

- Given a workspace with runs that started at 09:00 and 12:00, one team with a run at 11:00 and another team with runs at 13:00 and 08:00,
  when the Runs list is shown,
  then it lists the runs of 13:00, 12:00, 11:00, 09:00 and 08:00, in that order.
- Given a team whose runs can't be read,
  when the Runs list is shown,
  then the workspace's and the other teams' runs are listed, and that team is named with its error.
