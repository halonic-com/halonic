# Decision: the kept-grants sweep takes a list of roots instead of one run folder

- Task: HAL-6256 (follow-up to HAL-5884, as decided on HAL-6110)
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MzTkDt6BYbxFTgKPvfVNnMW3YP1gBuSBOSRHeLRfmbkCJyVTI6tX9Z/e3ayRP4Q0RZ8dGZUISzxlX7DlKO/+DA==

## What changes

The requirement `sandbox-srt.kept-grants` said the sweep forgets the kept grants "inside the run
folder it was given", "on the first open". It now says "inside the sweep roots it was given", "once
after the host starts and before its first open", and that without a root it lists and forgets
nothing. Its sweep example names two roots instead of one run folder.

## Why

A session's working folder often sits inside the workspace (`files/agents/<name>`), not under
`runs`, so one run folder misses grants the sweep is meant to take back. HAL-6256 changes
`SrtSandbox`'s `{ runsFolder }` option into `{ sweepRoots }`, and the agent host starts the sweep
as soon as it holds the profile's lock rather than at the first open, so the window in which a
second host could start sweeping stays small. The first open still waits for that same sweep.

## Tests

No test was weakened, skipped or deleted. The existing sweep tests pass a list with the one folder
they used before and keep every `expect`; new tests cover several roots, no root, and a sweep the
host started before the first open.

## Covers

- sandbox-srt.kept-grants
