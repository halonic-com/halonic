# runs.run-view.failed-child-run

- Status: draft
- Since: unreleased
- Source: HAL-15729 (C622 #1 on HAL-15727: the run page still said it can't tell why); the child read as `app.failed-child-run` finds it, and the words of `cli.commands.runs.show-child-failure` (HAL-15555), with **Open run** as the cancelled child's note offers it for its parent (`runs.run-view.child-runs`, UX check R9); a team decision under HAL-2282, building on the approved failed banners

When a run failed in a `workflow` or for-each step because a child run it started failed (`app.failed-child-run`), the run page's banner shall be the child's own failed banner (`runs.run-view.failure-banners`, or the general banner when Studio can't tell the child's cause), with "*Topics* failed in the step *Each*: the run it started for item 2" in place of the child's workflow, the item counted from 1, or "…: the run it started" for a `workflow` step, as `halonic runs show` leads the child's line. When the child's first line doesn't name its workflow, such as "Halonic couldn't reach *Ollama* …", a line before it shall say "*Topics* failed in the step *Each*: the run it started for item 2 failed in the step *Draft*." The banner shall keep the child's fix and its buttons that work from this page, without **See the step**, which would open the parent's step, and its first button shall be **Open run *short id***, which opens the child run's page, where the page can open runs. **Copy details** shall copy the child's details and the parent's run id. A child that was cancelled, or whose log is gone or empty, shall leave the run's own banner. The page shall follow one level of child run only, as `halonic runs show` does: when the child itself failed because a run it started failed, the banner shall be the child's general banner ("… Halonic can't tell the cause yet."), and **Open run** opens the child's page, whose banner names that run in turn.

## Examples

- Given a run of Topics that failed in the step Each after its run for item 1 failed in the step Draft because its items ({{input.topics}}) are a text,
  then the banner says "Topics failed in the step Each: the run it started for item 1 failed in the step Draft: its items ({{input.topics}}) are a text, not a list." and "Pass a JSON list, such as ["Monday", "Tuesday"].", with **Open run** to that run and no **See the step**.
- Given a run that failed in a `workflow` step Review after the child run it started failed for a reason Studio can't name,
  then the banner says "… failed in the step Review: the run it started failed in the step Draft. Halonic can't tell the cause yet."
- Given the child run for item 2 failed because Ollama ran out of memory,
  then the banner says "… failed in the step Each: the run it started for item 2 failed in the step Draft." and then the child's Ollama lines, with **Open Models**.
- Given the child run was cancelled,
  then the banner is the run's own.
- Given the child run for item 1 failed in its own step Each because a run it started failed,
  then the banner says "Topics failed in the step Each: the run it started for item 1 failed in the step Each. Halonic can't tell the cause yet.", with **Open run** to the child run, not to the run it started.
