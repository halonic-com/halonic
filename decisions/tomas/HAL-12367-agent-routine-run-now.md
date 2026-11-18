# Decision: Run now on an agent routine says agents can't run on their own yet

- Task: HAL-12367
- Approval: team decision under the HAL-2282 rule for small wording on approved screens (Sofia's UX check L2 on HAL-12363, microcopy revision 109 on HAL-751); Liam reviews the pull request on HAL-12367 and signs this note
- Kind: user-visible

## What changes

A routine whose Starts is an agent can't run in 0.1: the local executor refuses it with `AgentRunsNotAvailable`. The desktop app turned that refusal into "This window can't start an agent yet", and Run now then turned every `unavailable` into "The engine isn't answering", so the toast gave the wrong reason.

- The engine now passes the executor's own `AgentRunsNotAvailable` through, and Run now answers it as its own refusal, `agent-runs-not-available`.
- The toast (danger, stays) reads "Not started: Halonic can't run an agent on its own yet, only as a step in a workflow." with **Pick what it runs** and no **Try again**.

The requirement `studio.workspace-routines` gains this refusal in its text and one example, with a new test. No test was skipped, and every changed test still checks what the app does.

## Why

The engine was answering, so "The engine isn't answering" sent people looking for the wrong problem. The words come from Sofia's UX check and are small wording on a screen the board already approved, so the team decides them (HAL-2282).

## Covers

- studio.workspace-routines
