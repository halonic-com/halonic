# runs.row-columns

- Status: active
- Since: 0.1.0
- Source: HAL-7084 and HAL-7094 (T8); [ux-checklists-t8-t9](/HAL/issues/HAL-1360#document-ux-checklists-t8-t9) revision 10, 1.2; microcopy revision 94, 15.1 and 19.3 Run row (HAL-751); kit List columns (HAL-6764)

The Runs list shall lay its rows out in columns, in `halonic runs`' order: the status chip, the short id, what ran with its line and Test tag, what started the run, and the time the run started, with how long it took under it once it has ended. It shall be one list with an `h3` for each day the runs started. A failed row shall show its line as the error reason with the Failed chip. Screen readers shall hear one sentence for each row: its short id, what ran, its status and line, what started it and the time it started, with ", test run" for a test run.

## Examples

- Given a run with two open approvals that started at 10:40,
  when a screen reader reaches its row,
  then it hears "Run 01jd8q, Support reply, needs you, waiting for 2 approvals. Started by you, in the terminal, 10:40.".
- Given a finished test run that started at 10:40 and took 2 minutes,
  when its row is shown,
  then it reads Done, its short id, Support reply with the Test tag over "Sent nothing", and "10:40" over "took 2 min".
- Given a run that failed in the step Draft,
  when its row is shown,
  then its line "Support reply failed in the step Draft." is in the danger colour, with the Failed chip.
- Given a run the routine Morning brief started on its schedule of weekdays at 08:00,
  when its row is shown,
  then its Started by column reads "Schedule · weekdays at 08:00", with "Morning brief" in its tooltip,
  and a screen reader hears "Started by the schedule, weekdays at 08:00, 10:40." at the end of its sentence.
- Given a run of that routine that caught up after the computer slept,
  when its row is shown,
  then its Started by column reads "Caught up after sleep".
- Given runs started with Run, by a message, by a signal, without a trigger and by the test case "Refund over €100",
  when their rows are shown,
  then their Started by columns read "You, with Run", "A message arrived", "A signal arrived", "You, in the terminal" and "Test “Refund over €100”".
