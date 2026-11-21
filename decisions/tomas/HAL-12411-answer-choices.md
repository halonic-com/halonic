# Decision: an answer that isn't one of the step's choices names the choices

- Approval: Liam approves this note in his review of this pull request on HAL-12411 (R7 of Sofia's UX check on HAL-12390, a team decision with no board card under HAL-2282; Liam's yes on HAL-12464 to the step's choices as facts, each follow-up in its own PR)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2XHGghYtDTCjibZVQboNuOoia7r1SjLRuTqi+Oxh5hxgGfBI6Rm72EBydx6Dqo5MVSVcJP/zPtCFSREVGIz6Dw==
- Task: HAL-12411

## What changes

**Engine.** When an agent's answer isn't one of its `choice` options, the run still fails with
`answer-not-an-option` and the same error. It now also has a typed cause:
`{ kind: "invalid_input", code: "agent.answer-not-an-option", detail: { agent, options } }`.
`options` holds the choices the engine checked the answer against, as one JSON array, because a
cause's `detail` holds strings only and a choice may contain a comma. The answer is never in the
cause. A plain task, a for-each item and a parallel branch all give it. A parallel branch's
`agent.finished` carries the cause too, so a run rebuilt from its log fails with it as well.
`@halonicjs/events` builds and reads the cause (`answerNotAnOptionCause`, `answerChoicesOf`).

**Run page.** With that cause, the banner reads "*Support reply* failed in the step *Classify*:
*Sorter*'s answer wasn't one of the step's choices (*refund*, *question* or *spam*).", with
**See the step** and then **Run again** (UX check R7, microcopy 1.6). **See the step** opens the
failed step's panel, the same button a blocked run's banner has. It doesn't wait for the log. A
log written before the cause keeps #4092's sentence ("…answered with something that isn't one
of its options…").

## Why

The run page never shows the engine's message, and the choices are only in that message today.
Reading them from the workflow file would give the file as it is now, not as the run checked it.
A typed cause gives Studio the exact choices without parsing text, the same way the budget and
socket path causes work.

## Not in this change

The CLI keeps its line, the engine's message, which already names the choices. R9 (a child run
cancelled with its parent) is the next PR on this task.

## Tests

No test was weakened or removed. The three engine tests for an off-choice answer (task, for-each
item, parallel branch) now also expect the cause. New tests cover the cause and reading it back
(`answer-choices.test.ts`), the banner from the cause, the agent's file name, two choices, and
**See the step** before **Run again** opening the step's panel.

## Covers

- engine.task-choice-answer
- runs.run-view.failure-banners
