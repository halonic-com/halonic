# runs.list-announcements

- Status: active
- Since: unreleased
- Source: keyboard and screen-reader check (HAL-12426) A4; microcopy 19.3 revision 115 (HAL-751); shell `shell.announcer`

When the person changes the Runs list's filters (a status chip, Test runs or the Workflow chip), the list shall read, once the list has settled, how many runs it shows through the shell's `announceState` under the key `runs-filter`: "1 run." or "_N_ runs.", or, when it shows none, the filter's own line ("No failed runs.", "Nothing is waiting for you."). A refresh that changes the rows or their status shall not be read.

## Examples

- Given two failed runs among others,
  when the person picks Failed,
  then the screen reader hears "2 runs.".
- Given no run that needs the person,
  when the person picks Needs you,
  then the screen reader hears "Nothing is waiting for you.".
- Given the Runs list is open,
  when a run in it moves from Running to Needs you,
  then nothing is read.
