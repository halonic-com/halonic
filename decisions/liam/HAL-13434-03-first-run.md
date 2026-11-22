# Decision: the first run's run, and Cancel run, change three first-run requirements

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-7993 (the board approved the first-run flow on 19 Nov, sections 3.3 and 3.4 included); build plan and team decisions on https://paperclip.halonic.com/HAL/issues/HAL-13434
- Kind: user-visible

Build 6 of the approved first-run flow (first-run-flow, HAL-7985, revision 9) puts the run into the
first run: the guide card opens Pick a model, Continue starts Support reply at once, and **Cancel
run** in the first-run bar ends the run. Three requirements that build 5 wrote ahead of this change
with it, as the flow says:

- `first-run.guide-card`: **Run your first workflow** opens the Pick a model screen where the app
  can start a run (3.3: "Pressing Run your first workflow finds no usable model, so it opens this
  instead of failing"), and the page's Run form only where it can't, such as a served page with no
  engine. After a run that ended without a win, the card also shows the change line (8e.2).
- `first-run.state`: a cancelled run is over without a win, so it puts the first run at Run marked
  ended, not failed (3.4: "First run stays on: the strip is at step 3, and the guide card is back
  with the button Run again"). While Pick a model is open, the runs don't move the steps.
- `first-run.bar`: at Run, the way out is **Cancel run** while the run is going (3.4, 5, 8b). The
  engine can cancel a run in this release (`studio.engine-cancel`), so 10.2 R7's fallback isn't
  needed.

Two tests change with them, and no assertion is dropped. In `src/first-run-guide.test.ts`, the
guide is made with the run's build's new parts, and the Run form test is named for the page that
can't start a run, which still opens the Run form. In `src/ui/first-run-bar.test.tsx`, the bar is
given the run's build's start service, and `barWayOut` takes whether the engine can cancel, with
`false` where the test checks the steps that show no way out. The new behaviour has its own
requirement and tests: `first-run.run`.

## Covers

- first-run.guide-card
- first-run.state
- first-run.bar
- packages/studio/features/first-run/src/first-run-guide.test.ts
- packages/studio/features/first-run/src/ui/first-run-bar.test.tsx
