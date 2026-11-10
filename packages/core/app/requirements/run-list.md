# app.run-list

- Status: active
- Since: 0.1.0
- Source: HAL-2742; C174 on HAL-2000 and HAL-1984; cli-output revision 27, section 3.4 (HAL-1981)

The run history shall list a workspace's real runs that match the filter, newest start time first, and never its test runs. It shall return at most the limit asked for, 20 when none is given, together with the number of runs that match in all, so a caller knows when the list was cut. It shall refuse a limit that isn't a whole number of 1 or more.

## Examples

- Given 23 real runs and no limit,
  when the runs are listed,
  then the 20 newest are returned, newest first, with a total of 23.
- Given two failed runs, one waiting run and one failed test run,
  when the failed runs are listed,
  then the two failed real runs are returned with a total of 2.
- Given runs of the workflows `support-reply` and `mail-triage`,
  when the runs of `mail-triage` are listed,
  then only those are returned.
- Given no runs,
  when the runs are listed,
  then the list is empty with a total of 0.
- Given a limit of 0 or 2.5,
  when the runs are listed,
  then the request is refused as the caller's mistake.
