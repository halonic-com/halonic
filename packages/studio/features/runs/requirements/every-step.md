# runs.every-step

- Status: active
- Since: 0.1.0
- Source: HAL-1301 (T8 PR 5); ux-checklists-t8-t9 (HAL-1360) revision 10, 1.10; component specs 23.5 and 24.2 (HAL-175); microcopy revision 94, 15.2 and 19.3 (HAL-751); cli-output 3.4

The run page shall show Every step under its banner: the `h2` "Every step", then one timeline entry for each step the run reached, in the order it reached them, read from the run's log by the app's `runSteps`, so the run page and `halonic runs show` list the same steps. Each entry shall show the step's plain name, one line of what happened, the time the run entered the step at the right, and a 16px dot with its mark: ✓ done, × failed, ‖ waiting for you, the live dot while it runs or waits for a time or a child run, and ■ stopped. The step a run was cancelled in shall read "Cancelled in this step", and the step a run reached its budget in "Budget reached after" how long it took, both with the stopped mark. A screen reader shall hear each entry with its state first. The timeline shall be one kit List with one Tab stop. The run page shall read the log again whenever the run moves on, and keep the steps it showed when a later read fails.

## Examples

- Given a run that read, was approved at 10:43 at the wait step "Approve this reply?" and is drafting,
  when its page is shown,
  then Every step lists "Read" done "Took 1 min" at 10:40, "Approve this reply?" done "You approved at 10:43" at 10:41, and "Draft" running at 10:43.
- Given a run that failed in the step Draft,
  then its entry is read "Draft, failed, 10:41, Failed after 1 s".
- Given a run cancelled in the step Classify,
  then its entry has the stopped mark and reads "Cancelled in this step".
- Given a run waiting until 14:00,
  then its last entry reads "Waiting until 14:00" with the live dot.
