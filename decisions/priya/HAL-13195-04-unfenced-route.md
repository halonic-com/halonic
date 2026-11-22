# Decision: say exactly which proposal folder passes the gate for a session on this computer

- Approval: /HAL/issues/HAL-16384 (Julian's security check and Liam's review of #5155 asked for this wording and test)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:lEg31hsqRc28QJ5ixYp1LnhWy0AqVEY1jyyo8aVm62dACOhBV6fyp6v84VZ1Xeptxy6TDFz6M60qSRU2RndTCg==
- Task: HAL-13195

## What changes

`agent-host.unfenced-gate` said that "a folder a fenced agent could write never passes". It now says what the code checks: only the proposal folder the host made for that run, while the run is open, passes. It also says that the page names the run by its `runId`, and that the fenced agents of one run share its proposal folder by design. One example is added: a record of the run's proposal folder that the host can't read gets `profile_not_built`. A test for that example is added too.

## Why

Julian pointed out on HAL-16384 that the old sentence promised more than the gate does. A fenced agent of the same run can write in that run's proposal folder, which is how proposals work. The gate never claimed to stop that: it holds the folder to the one the host made for the run. The new sentence matches the code, and the new example covers the gate's fail-closed branch, which had no test.

## What doesn't change

The gate's code and its order of checks. Every refusal it gave before, it still gives.

## Covers

- agent-host.unfenced-gate
