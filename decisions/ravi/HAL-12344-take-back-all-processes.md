# Decision: Take back stops runs without the sandbox in every process, and waits for a start in progress

- Approval: Liam assigned HAL-12344 (finding M2 of the P10 security review on HAL-1743) and left the approach to Ravi; Liam signs this note
- Kind: internal
- Task: HAL-12344

## What changes

- Requirement `app.unfenced-runs`: each process keeps its own runs without the sandbox, but the
  saved yes is shared through the profile. While runs are registered, `UnfencedRuns` reads the
  saved yes again every second and stops each run whose yes is gone, can't be read or is for
  another reason. So a Take back in Studio also stops a CLI runner, within about a second, instead
  of leaving it running until its idle stop or time limit. The review offered two options: check
  the yes while running, or document Take back as covering this app only. This note picks the
  first, as the review recommended.
- Requirement `app.unfenced-runs`: Take back waits for starts without the sandbox that are still
  in progress before it returns, so the toast "Taken back" is no longer true too early.
- Requirement `app.runner-start-gate`: the gate lets Take back wait for a start without the
  sandbox from before the start reads the yes, and registers each run with the reason of its yes.
- `UnfencedRunsOptions` gets a required `timers`, as `SaveScheduler` and `askApprovals` already
  have. Nothing calls `UnfencedRuns.allow()` yet, so no user can see this change today.

## Tests

No requirement was retired or weakened, and no test or golden file was skipped or deleted. One
test in `runner-start-gate.test.ts` is rewritten and made stricter: it used to call Take back from
inside the start, which now waits on that same start. It now runs Take back while the runner is
still starting, and checks that Take back returns only after the runner was stopped. Tests are
added to `unfenced-runs.test.ts` and `runner-start-gate.test.ts`. Test callers in the CLI, the
agent host and `core/app` pass the new `timers`.

## Covers

- app.unfenced-runs
- app.runner-start-gate
- packages/core/app/requirements/unfenced-runs.md
- packages/core/app/requirements/runner-start-gate.md
- packages/core/app/src/runner-start-gate.test.ts
