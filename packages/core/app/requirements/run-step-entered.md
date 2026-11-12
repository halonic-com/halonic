# app.run-step-entered

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8 PR 5); ux-checklists-t8-t9 revision 10, 1.10 (HAL-1360)

The app shall give each step it reads from a run's log the time the run entered it, so the Studio's Every step can show the time next to the step.

## Examples

- Given a run that entered read at 14:00:00, draft at 14:00:01 and review at 14:00:10,
  when its steps are read,
  then each step says the time the run entered it.
