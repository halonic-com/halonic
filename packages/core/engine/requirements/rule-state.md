# engine.rule-state

- Status: active
- Since: unreleased
- Source: HAL-18500 (S11 of HAL-18490, on the PR watcher's critical path), with the plan rev 1 approved there; ToolScript ADR `docs/adr/2026-11-24-toolscript.md`, sections 2.1 and 2.3

When a run enters a `rule` state, the engine shall run the state's rule, with no model call: the code the run's kept definitions hold for the state's `rule` path, never the hub's file as it is now, in a fresh isolate of the `ToolScriptIsolate` port, with no host functions, `ctx.input` the state's `input` rendered against the run, and the ToolScript ADR's agent limits (`toolScriptDefaultLimits.agent`), lowered to the isolate's own and never raised by the workflow file. When the rule returns, the engine shall write its output to the state's `output` with `context.updated`, send the state's `signal` if it has one, and finish the state with `done`. When the rule fails, the run shall fail with an error that names the step and the reason code, such as `limit.cpu`, `toolscript.script-error`, `rule.missing` for a path the kept definitions don't hold, or `rule.not-run` for an isolate that refused the call. A `rule` state with no `rule` or no `output` shall fail the run as it is entered. A local executor given no isolate shall fail the run at its first rule step with `Step "<name>" is a rule step, and rule steps can't run here yet. Remove the step to run this workflow.`, and shall run every other run as before. A result for a call the run no longer waits on shall change nothing.

Rationale: a no-model routine, such as the PR watcher, decides with code it can test, and the rule itself can cause no effect.

## Examples

- Given the rule step `match`, then the final step `done` whose signal reads `{{context.decisions.merge}}`, and an engine whose model calls fail,
  when the run starts,
  then the rule gets `{ prs: [5, 7] }`, `decisions` is the rule's output, the signal carries `[7]`, and the run completes.
- Given a rule that the isolate stops with `limit.cpu`,
  when the run reaches it,
  then the run fails with `Rule step "match" failed with limit.cpu: …`.
- Given a run whose definitions hold no code for `rules/match.rule.js`,
  when it reaches the rule step,
  then it fails with `rule.missing`.
- Given an engine with no isolate,
  when a run reaches a rule step,
  then it fails with `Step "<name>" is a rule step, and rule steps can't run here yet. Remove the step to run this workflow.`, and no timer is set.
