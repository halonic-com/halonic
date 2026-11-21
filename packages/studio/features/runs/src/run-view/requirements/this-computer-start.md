# runs.run-view.this-computer-start

- Status: active
- Since: unreleased
- Source: task HAL-15203 (item 1 of Iris's flow check C548 on HAL-15156: Studio's run page says what `halonic runs show` says, `cli.run-failed-this-computer-start` from HAL-13090; wording on an approved screen, decided by the team under HAL-2282); task HAL-15362 (row 11 of the words check C566 on HAL-15352: the launcher's reason moves to Copy details, and the banner gives a next step); task HAL-15528 (item 6 of the flow check C587 on HAL-15498: the next step names the place, as the CLI's line 2 does, and the banner offers Report a problem)

When a run failed with `this-computer-start-failed` and its log holds the failed step's own `sandbox.started`, the run page's banner shall say, in the danger tone, what `halonic run` says on its first line, then a next step: "*Support reply* failed in the step *Draft*: *Writer* didn't start on this computer. Nothing ran in that step. Halonic can't fix this from here: copy the details and report it on GitHub. Reports there are public, so take out anything private first.", with the agent of that `sandbox.started` as its file names it (its id when the workspace no longer has it). The launcher's reason, which the engine logs as `run.failed`'s error, is Halonic's own text: it shall be in **Copy details** only, never on the banner. It shall never name a sandbox, since the person chose to run the agent without one. The banner shall offer **Copy details**, then **Report a problem ↗**, which opens a new issue on Halonic's GitHub (`https://github.com/halonic-com/halonic/issues/new`, as Settings › About Halonic does) through the host's external open, with "Opens GitHub" as its tooltip, and no **Run again**, since the same launcher would refuse the run the same way. Until the log is read, and for a log without that step's `sandbox.started`, the page keeps its general banner, as the CLI keeps its general lines.

## Examples

- Given a run of Support reply that failed in the step Draft with `this-computer-start-failed`, after the step's `sandbox.started` for the agent `writer`, named Writer, and the error "a program started without a fence can't reach a bridge on a Unix socket",
  when its page is shown,
  then the banner reads "Support reply failed in the step Draft: Writer didn't start on this computer. Nothing ran in that step. Halonic can't fix this from here: copy the details and report it on GitHub. Reports there are public, so take out anything private first." with **Copy details**, which holds the error, then **Report a problem ↗**, and no **Run again**, and never "Halonic can't tell the cause yet".
- Given such a run whose log has no `sandbox.started` for that step,
  when its page is shown,
  then it keeps the general banner.
