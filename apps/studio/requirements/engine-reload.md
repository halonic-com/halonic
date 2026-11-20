# studio.engine-reload

- Status: draft
- Since: unreleased
- Source: HAL-13318 item 5, split to HAL-13344; `studio.engine-service`; `engine.end-interrupted-runs`

When the Studio's page reloads, the Studio shall treat it as a crash of the engine in it: the page's engine stops where it is, without closing, and the window keeps its engine lock. When the reloaded page next opens the workspace's engine in the same window, the Studio shall take that lock back and build a new engine on the same run, blob and record stores, and that engine shall go on from the run logs as an engine does after a crash, never from what the old page held in memory. A run that was `running` when the page reloaded shall end as `failed` with `reason: "interrupted"` in the state it was in, and the step it was in shall not run again. A run that was `waiting` for an event, a timer or a child run shall stay waiting, and go on from its log when its answer comes, once. No run shall run twice.

## Examples

- Given a run whose model call hasn't answered when the page reloads,
  when the reloaded page opens the engine,
  then the run ends as `failed` with `reason: "interrupted"` in the step it was in, and the model was called once.
- Given a run waiting for `approve` when the page reloads,
  when the reloaded page sends `approve` to it,
  then the run completes, and its log has one start and one completion.
