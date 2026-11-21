# Decision: a child run cancelled because its parent ended says so, with a link to the parent

- Approval: Liam approves this note in his review of this pull request on HAL-12411 (R9 of Sofia's UX check on HAL-12390, a team decision with no board card under HAL-2282; Liam's yes on HAL-12464 to a typed cause from the engine, each follow-up in its own PR)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3OPWS8XLCgqGgaFMFkQAChH7XaXnOlD11SRP3XnEjczLbe1vO0sdaeu56xZksKTvpWg/bt68izYxZbebTlJ/Cg==
- Task: HAL-12411

## What changes

**Engine.** When a run ends for any reason but a cancel, each child run it started that is still
going is cancelled as before (`reason: "cancelled"`, the same error). It now also has a typed
cause: `{ kind: "conflict", code: "run.parent-ended" }`. The same goes for a waiting child the
engine ends on start because its parent had already ended. A child of a run the person cancelled
gets no cause: "The run was cancelled." already says why. The cause has no `detail`, because
the parent is the run's own `parent`. `@halonicjs/events` gives the cause and reads it
(`parentEndedCause`, `endedWithParent`).

**Run page.** With that cause, the cancelled note reads "*Support reply* was cancelled because
the run that started it ended. Nothing after the step *Draft* ran." (UX check R9), or without the
second sentence when the child hadn't started a step. **Open run 4f2a1b** follows it as an inline
link to the parent's page, where the page can open another run; the wording is the one the
waiting banner already uses for a child run. A log written before the cause keeps the plain note.

**R7's banner, the same words as an older log (Iris's C516 S-1 on HAL-14955).** With the
choices, the banner now reads "*Support reply* stopped in the step *Classify*: *Sorter*'s answer
wasn't one of the step's choices (*refund*, *question* or *spam*). Make its instructions
stricter, or pick a larger model, then run again.", the same verb and fix as an older log's line
(rule E4; microcopy 22 F22, revision 121, a team decision under HAL-2282). The sentence ends
"then run again", so **Run again** comes first and **See the step** follows it (E2).

## Why

The run page didn't say why such a child ended, and the engine's reason showed nowhere. Studio
shouldn't match the error text, so the engine says it with a typed cause, as for the budget stop
and the answer choices. `conflict` is the closest of the eight kinds: the run couldn't go on
because of what happened to another run, not because of its own input or a fault.

## Not in this change

The CLI's lines for a cancelled run stay as they are. The receipt's "Cancelled in Draft after
3 min" and the status announcement don't change.

## Tests

No test was weakened or removed. The engine tests for a child cancelled with its parent (a
for-each item, a child left waiting on start) now also expect the cause, and a cancel's children
expect none. New tests cover the cause (`parent-ended.test.ts`), the note in its step and before
it started, the plain note for an older log, and **Open run** opening the parent. R7's tests
expect the new sentence and **Run again** before **See the step**.

## Covers

- engine.child-runs-end-with-run
- engine.end-orphaned-child-runs
- runs.run-page
- runs.run-view.failure-banners
