# engine.report-interrupted-runs

- Status: active
- Since: 0.1.0
- Source: HAL-1845 (the Studio's "started again" notice, F15b); Liam's decision on HAL-10694

When the engine is asked to get ready, it shall end the runs it lost when it last stopped (`engine.end-interrupted-runs`, `engine.end-orphaned-child-runs`) if that hasn't happened yet, and then tell how many of them it ended with `reason: "interrupted"`. A child run it cancelled because its parent had ended (`reason: "cancelled"`) shall not be counted. It shall tell the same number on every call, and end no run twice. A failure to end them is raised, and tried again on the next call.

The Studio's shell shows the number to the user after a restart, so the engine has to know it before it reports ready, not on the first call to the runs.

## Examples

- Given two runs that were going when the engine stopped, and a child run that waits under a parent that had failed,
  when the engine gets ready,
  then it tells 2, and the child's log ends with `reason: "cancelled"`.
- Given the engine got ready and told 2,
  when it is asked to get ready again,
  then it tells 2, and no log changes.
- Given no run was lost,
  when the engine gets ready,
  then it tells 0.
