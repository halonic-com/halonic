# Decision: a parent records `workflow.resumed` when its waiting child runs again

- Approval: [HAL-6144](/HAL/issues/HAL-6144), option A, decided by the CTO; he approves this note in his review of this pull request on [HAL-6173](/HAL/issues/HAL-6173)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hsLWMi81RAGetbKFBRfAgGk2vI+U8D1IvDoR0CuA1JZcf/yLWBJum2K+vZcgZYMfgxppx92CG6lfkEkqO7LuAw==
- Task: HAL-6173

## What changes

The run log gets a `workflow.resumed { state, childRunId }` event (new requirement
`events.workflow-resumed`). A run in a `workflow` state records it when the child it waits with
runs again without finishing: a send passed to the child moves it on, or the child's own timer
does. The parent folds to `running` with `accepts: []`, in the engine's run state and in the
summary, and an event sent to it is then refused with the parent's own id. Until now the parent
kept the child's old `run.waiting` while the child worked, so its log, summary and the Studio
showed a wait that was over, and a second send went to the child and was refused with the
child's id.

Both paths go through one place. `tellParent` now also tells a parent when a step leaves its
child running and the child was waiting before it, and `childNow` reports a running child as
`{ status: "running" }` instead of nothing. The `workflow` state turns that into
`workflow.resumed`, once; a `foreach` state ignores it, because its items' children never wait.

Requirements:

- `events.run-log-contract`: `workflow.resumed` joins the events added since the reference. No
  reference event or field changes.
- `events.timeline-entry-id`: `workflow.resumed` updates the entry of the `run.waiting` it ends,
  as `timer.fired` and `event.received` do.
- `engine.child-tells-parent`: a child that runs again after it waited tells its parent too.
- `engine.workflow-state`: the parent records `workflow.resumed` and takes no events until the
  child waits again.
- `engine.local-child-runs`: new example for the send and the timer path. The example of a
  waiting parent whose child the engine stopped now says the engine stopped before the parent
  heard: a parent that heard is running, and a restart ends it as interrupted with its child,
  as it always did for a parent whose child never waited.
- `cli.run-view`: a workflow step whose child runs again shows as running, not waiting.

`docs/specs/workflow-semantics.md` ("Subflows", step 4) says the same.

## Older readers

A reader older than this event skips it. `summarize`, `entryOf`, the engine's fold and the CLI
run view each switch on the event type with a `default` that changes nothing, and
`parseEventLine` reads any object. So an older reader shows the parent as waiting until the
child waits again or finishes, as it did before this change, and doesn't break. A test in
`workflow-resumed.test.ts` checks that a log with an event type the package doesn't know
summarizes as it would without that event, and that the event is its own timeline entry.

The engine's run state keeps its shape, so the snapshot version stays at 10: an older snapshot
was folded from a log without `workflow.resumed`, and it folds the same today.

## Tests

No test was weakened. Two tests in `local-runs-child.test.ts` ("tells a waiting parent that its
child ended as interrupted…" and "…even when a folder's end throws") set up a parent that waits
while its child runs. After this change that only happens when the engine stops after the child
moved on and before its parent heard, so their setup now stops the engine exactly there (the
parent's `child:` timer can't be set) and their checks are unchanged. A new test covers the
parent that heard: a restart ends it as interrupted with its child.

New tests: the send path and the timer path in `local-runs-child.test.ts`, the
`workflow.resumed` decision and its "once" in `states/workflow/state.test.ts`, the
`tell-parent` effect of a child that runs again in the same file, the event's type, summary,
timeline entry and an unknown event in `workflow-resumed.test.ts`, and the CLI step in
`run-view.test.ts`. Each new engine test fails without the change to `tellParent`.

## Covers

- events.run-log-contract
- events.timeline-entry-id
- engine.child-tells-parent
- engine.workflow-state
- engine.local-child-runs
- cli.run-view
- packages/core/engine/src/run/local-runs-child.test.ts
