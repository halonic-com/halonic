# runtime.worker-executor

- Status: active
- Since: unreleased
- Source: HAL-16012, part a2 of the plan on HAL-13210

The Worker shall build its run executor with the engine's `assembleEngine`, on the Worker's run store, run-object scheduler, blobs, coordination, clock and secrets, with the run definitions and the model resolver passed in. It shall carry no run logic of its own. When a run's agent names a harness, the run shall fail with reason `harness-unavailable` and an error that names the `run-harness` effect, before any model or program is called and with no timer left. The Worker's executor shall offer no proposal folders and no connector calls, so a `call-tool` effect fails the run.

Rationale: a run on Cloudflare must take the same steps as one on a laptop, and what the Worker can't host must be refused with a reason, never left to an undefined part.

## Examples

- Given the `acme` hub's `reply` workflow with a plain `writer` agent and a scripted model, when the Worker's executor starts it, then `run.started` lands in the run store and the run object gets a timer; when that timer is delivered, the model's answer lands and the run ends with `run.completed`.
- Given the same workflow with `writer` in `claude-code`, when the Worker's executor starts it, then the run fails with `harness-unavailable`, its error names `run-harness`, and the model is never called.
