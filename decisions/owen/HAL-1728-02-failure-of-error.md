# Decision: one error per failure, and one function from error to run failure reason

- Requirements: `ports.model-call-error`, `engine.model-failure-stops`, `ports.every-port-versioned`
- Task: HAL-1728, part 02 (see the plan on HAL-1728); review on HAL-2085
- Approval: Liam decided the split in his HAL-2085 review; the package owner (Liam) approves this note in review

## What changes

**A provider throws only `ModelCallError`.** It gains the reason `out-of-memory`, which a provider
finds with `isModelOutOfMemory(text)` and which stops the turn like `refused`, and an optional
`host`, kept only with `offline`: the name and port that didn't answer. `isModelCallError` also
checks that a `host` is a string. The `ports.model-call-error` text and its examples name both, and
the type test that pins the reasons lists six instead of five. `llmProviderVersion` stays at 1, as
in HAL-1880: a provider that never throws `out-of-memory` or sets `host` keeps working, and callers
already treat an unknown error as `refused`.

**`RunFailureError` is for adapters that aren't providers.** It names `disk-full`,
`sandbox-start-failed` or `harness-start-failed`, takes no host, and is checked with
`isRunFailureError` by name and failure, not `instanceof`. `run-failure-error.ts` joins `chat.ts` on
the list of source files in `packages/core/ports/src` that hold shared types rather than a port, so
the version test doesn't ask it for a version constant.

**It carries no error kind.** The first version gave each failure a kind from `@halonicjs/std`, and
`limit_reached` for memory and disk. Liam pointed out that Studio offers _Try again_ for
`limit_reached`, and it does for `unavailable` too, which a full disk doesn't need. No other kind
fits either. The engine turns this error into a `run.failed` reason, so a surface shows a failed
run by that reason (no surface does yet), and the error itself never reaches one and needs no kind.
`ModelCallError` has none for the same reason. This also drops the wait on #600 (ports using std).

**`runFailureReasonOf` grows; there is no second function.** As Liam asked, main's function is
extended rather than joined by a new one. It moves from `agent/model-chain.ts` to
`run/run-failure-reason-of.ts`, because it now reads errors that aren't model calls
(`RunFailureError`, `ENOSPC`, `AbortError`). It returns a `RunFailure`, the reason with the host
for `model-unreachable`, instead of the bare reason. Requirement `engine.run-failure-reason-of`
lists every mapping.

**A chain whose models were all offline now fails the run with `model-unreachable`**, with the host
of the last model when its provider named it. Before, that was `error`. `engine.model-failure-stops`
says so, and the model chain test that expected `error` now expects `model-unreachable`.

## Tests

No test was weakened. The reason list test gains one reason. The all-offline test expects the more
precise reason the requirement now asks for. Every port file is still checked for one version
constant, `portVersions` and the README table; the not-a-port list only names one more file.
