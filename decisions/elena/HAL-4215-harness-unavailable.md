# Decision: a run whose harness step can't start fails with `harness-unavailable`

- Approval: Liam's review of the test runner plan on [HAL-4224](/HAL/issues/HAL-4224) ("If the
  engine has no typed signal for it, add one"); the maintainer approves this note in review
- Kind: internal
- Task: HAL-4215

## What changes

`RunFailureReason` gains `harness-unavailable`, with its own requirement
(`events.run-failed-harness-unavailable`). The main sentence of `events.run-failed-reason` names it
next to the other reasons added since.

`engine.local-runs-unbuilt-effect` changes one thing: a run whose step asks for a harness run, in
an engine without harnesses, now fails with `reason: "harness-unavailable"` instead of `error`. A
tool call the engine can't carry out still fails with `error`. The error text, the `run.failed`
event, and the rule that no timer is set all stay as they were. The example for the harness case
names the new reason, and the tool-call example now names `error`, which it already was.

## Why

The test runner reports a step that would start a program as `unscripted-program`, naming the step.
Liam asked that it tell this from a typed field, never from the error's text. Before this change,
the only sign was the sentence "can't carry out a run-harness effect". `halonic run` gets the
reason too. Its words don't change: the CLI gives `harness-unavailable` the general lines with the
engine's message, like the other newer reasons.

## Tests

No test was weakened. The harness test in `engine.local-runs-unbuilt-effect` expects the new reason
instead of `error`, with the same other checks. The reason list test gains one reason, and the CLI's
general-lines test gains one case.

## Covers

- engine.local-runs-unbuilt-effect
- events.run-failed-reason
