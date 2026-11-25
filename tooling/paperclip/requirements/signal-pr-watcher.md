# paperclip.signal-pr-watcher

- Status: active
- Since: unreleased
- Source: HAL-17980 (plan HAL-17450 rev 5, "Step 2"; the ToolScript ADR 2026-11-24, P1 to P7; Liam's design on HAL-17772)

The `pr-watcher` signal rule shall work out the PR watcher's done and wake actions from a compact JSON input (time only from `now`, the settings, and per task its holder, the agent its branches name, whether it is running, has an open child task or is parked, what the watcher told it before and its pull requests' states) and give the same actions as `paperclip.pr-watcher-done` and `paperclip.pr-watcher-wake` (a task update to `done`, or one wake per new state with the watcher's own key), then leave out the wakes whose state isn't in `wakeOn` and the done when `done` is off. Each file in `signals/rules/` shall import only types, read no clock, network, file or randomness and stay under 300 lines. The plugin shall cut one pass's tasks into rule inputs of at most 16 KB each, the ToolScript `inputBytes` default, and leave out and name a task too large for one of its own.

## Examples

- Given every recorded pull request state (green, red and conflicting, a review on the head, merged and waiting, merged and green, merged with `main` green), alone and in pairs, and the open ones retargeted, held, approved on GitHub, a draft or queued, with each memory (nothing told, everything told, seen after the review, the hold line after or before the merge, a comment after the merge) and each task (running, with an open child task, parked, held by another agent, branches naming no one),
  when today's watcher and the rule decide,
  then their actions are equal, and between them they mark a task done and wake for every state.
- Given 60 busy tasks, when the inputs are cut, then each is at most 16 KB, one task is under 1,100 bytes and every task is in exactly one input in order.
- Given `wakeOn: [conflict]`, when two open pull requests are red and conflicting, then only the two conflicts wake; with `done: false`, a landed task gets no action.
