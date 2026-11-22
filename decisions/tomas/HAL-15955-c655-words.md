# Decision: a failed call whose plugin's sandbox can't start says why

- Approval: /HAL/issues/HAL-15955 (from the words check C655, row 49, on HAL-15936). The team decides it under the HAL-2282 rule, since it gives an approved screen's existing line its reason.
- Kind: user-visible
- Task: HAL-15955

## What changes

- app.failed-call-line: a connector that didn't start with the cause `sandbox-not-ready` now gets its own line, "Didn't work: the connector orders didn't start: the sandbox its plugin runs in can't start on this computer.", and its listing line "Couldn't list the tools from orders: the sandbox its plugin runs in can't start on this computer.", in place of the bare "didn't start" line. There is no button, as for the other causes with no fix the person can make here. One example is added.

## Why

C655 row 49: `halonic run` and `runs show` already give this reason, but Studio's run page, which reads the words from `failed-call-line.ts`, fell through to the bare line. The check for a missing plugin name came before the sandbox case, so the sandbox case was never reached; the new line names no plugin, so it needs no name.

## What doesn't change

The other causes' lines, the order the failed calls are read in and the engine's logged cause stay as they are.

## Tests

No test was weakened or skipped. `failed-call-line.test.ts` adds a test for the call's line with the cause `sandbox-not-ready` and a check of its listing line.

## Covers

- app.failed-call-line
