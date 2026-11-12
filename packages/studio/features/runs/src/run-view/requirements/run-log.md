# runs.run-view.run-log

- Status: active
- Since: 0.1.0
- Source: ux-checklists-t8-t9 (HAL-1360) part 1, 1.10 and 1.11; design-runs (HAL-176) 3.2 (Q12); microcopy 1.2 and 3.D W-D3; "Show every step" by Elena, a team decision under HAL-2282 (HAL-1301)

When the person presses **Show the run log** under Every step, the run page shall show the run's log in place of the timeline: one numbered line per event, in `seq` order, the same events `halonic runs show --json` returns. Each line shall give the event's `seq`, its time with seconds, its `type` and its other fields as one line of JSON, as plain text, with every hidden or direction-changing character written as its `\uXXXX` escape (`std.hidden-characters`). A step's blocked sites shall show as its "Blocked: …" lines, once, where its first site was blocked, in place of their `sandbox.blocked` events; a blocked file stays an event line. The run log shall never be the first thing the page shows, and the same button, then named **Show every step**, shall bring the timeline back.

## Examples

- Given a run whose log has `run.started` and then `state.entered` for draft at 10:41,
  when the person shows the run log,
  then it reads `1 10:40:00 run.started {…}` and `2 10:41:00 state.entered {"state":"draft"}`.
- Given an event whose value holds a right-to-left override,
  when the person shows the run log,
  then the line shows `\u202e` in its place.
- Given step Install was refused registry.npmjs.org 12 times,
  when the person shows the run log,
  then one line reads "Blocked: registry.npmjs.org (12 tries)" where the first refusal was.
- Given the person opens a run,
  when the page has loaded,
  then it shows Every step, and the run log only after **Show the run log**.
