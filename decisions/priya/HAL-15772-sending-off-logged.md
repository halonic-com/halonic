# Decision: a send refused because sending is off is logged, and `runs show` says so

- Approval: /HAL/issues/HAL-15765 (decided by Liam, from C623); task HAL-15772, part 1
- Kind: user-visible
- Task: HAL-15772

## What changes

A run answers a call to a connector's tool labelled `send` with `Refused: sending is off …` when the connector may not send (`refuseUnsent` in the engine). Until now nothing went into the run log, so `halonic runs show` printed "Sent nothing" and couldn't say why.

- events.tool-refused: `reason` gains `sending-off`, and a `sending-off` refusal names the connector in `connector`. The event type becomes a union of the two reasons, so a `sending-off` without `connector` isn't a valid event. Nothing is renamed or removed, and an old log stays valid. The type moves from `run-event.ts` to its own `tool-refused.ts`, as other events have, which keeps `run-event.ts` under the file-size headroom.
- engine.run-connector-calls: a refused send also writes one `tool.refused` with `sending-off` and the connector. It does so before a person would be asked and again after an OK, the two places that refuse it. The two examples that said "nothing is recorded" now name the event. No person is asked about a send that would be refused anyway, as before.
- engine.turn-logs-events: names the second reason next to `not-offered`.
- cli.runs-show-sending-off (new, active): `runs show` prints "! The call to send_mail was refused: sending is off for mail, so nothing was sent." once for each connector and tool, after the lines for connectors that didn't start. This is team wording, as HAL-2282 allows. It names no fix yet: part 2 of HAL-15772 (`halonic run` reads the saved setting) adds the fix where there is one.

## Why

An audit of a run should show every call that was stopped before it ran, and the person should see why the run sent nothing. The engine already wrote `tool.refused` for a tool nobody offered (HAL-4658), and that note left a refused send out because no reader needed it then. C623 found the reader that does: `runs show`.

## What doesn't change

No call is made, no effect is recorded and no person is asked for a refused send, as before. A retry after sending was switched off still records a `tool.result` with the error and the `sending-off` cause (`engine.tool-result-cause`), not a `tool.refused`, because that call was already recorded as an effect.

## Tests

No test was weakened. `local-runs-connector-calls.test.ts` adds the `tool.refused` check to the existing "sending is off" and "checked again after the OK" tests. `tool-refused.test.ts` pins both reasons and refuses a `sending-off` without a connector. `show-refused.test.ts` is new.

## Covers

- events.tool-refused
- engine.run-connector-calls
- engine.turn-logs-events
- packages/core/events/src/tool-refused.test.ts
- packages/core/engine/src/run/local-runs-connector-calls.test.ts
