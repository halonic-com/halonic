# app.run-standing

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8); run-object-mapping revision 3, sections 2 and 4 (HAL-2015); microcopy revision 94, 15.2 (HAL-751)

The app shall tell where a run stands from its summary: running, needs you, waiting, done, failed, stopped at its budget, cancelled, or couldn't try. A run with an open approval shall need you, even while its status is running. A waiting run shall need you when it waits for an approval or at a step that takes events, and shall be waiting when it waits for a child run or a timer. A failed run shall be stopped at its budget when its reason is `budget`, cancelled when its reason is `cancelled`, and failed otherwise.

The app shall tell what a waiting run waits for, the first that applies: its open approvals, with the oldest and how many; a child run; a step that takes events, with the step's description and its timer; a timer. A running run shall wait only for its open approvals, and an ended run for nothing.

## Examples

- Given a running run with one open approval,
  when its standing is asked for,
  then it needs you, and it waits for 1 approval.
- Given a waiting run with two open approvals,
  when what it waits for is asked for,
  then it is the approvals, the oldest first asked, and the count 2.
- Given a waiting run with a child run that also accepts events,
  when what it waits for is asked for,
  then it is the child run, and the run is waiting, not needing you.
- Given a waiting run at a step that accepts `approve` and `reject` and has a timer,
  when what it waits for is asked for,
  then it is the step, with both events and the timer, and the run needs you.
- Given a waiting run with only a timer,
  when its standing is asked for,
  then it is waiting, until that time.
- Given failed runs with the reasons `budget`, `cancelled` and `model-missing`,
  when their standing is asked for,
  then they are stopped at the budget, cancelled and failed.
