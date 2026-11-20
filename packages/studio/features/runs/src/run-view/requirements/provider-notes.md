# runs.run-view.provider-notes

- Status: active
- Since: unreleased
- Source: HAL-12315 (team decision), Noah's spec on HAL-12317, task HAL-12318; the same notes as `halonic runs show` and `read_run` (`events.provider-notes`)

The run page shall show, under Every step, after the timeline or the run log and before the **Show the run log** button, the providers' notes on how they changed the run's model calls, one quiet line each (the kit's `NoteLines`, named "Notes on this run"): each distinct note once, in the order it first came (`providerNotes`), with every hidden character written as its `\uXXXX` escape (`std.hidden-characters`). A run without notes shall show no list.

## Examples

- Given a run whose three model calls each say "Left out temperature: claude-sonnet-5-5 doesn't take it.",
  when the person opens it,
  then that sentence shows once, under the steps and above **Show the run log**.
- Given the same run,
  when the person shows the run log,
  then the sentence shows once, under the run log.
- Given a run whose model calls have no notes,
  when the person opens it,
  then there is no "Notes on this run" list.
