# Decision: the run log records the bridge's unnamed failures as `bridge.failed`

- Approval: HAL-11313, plan approved by the CTO (maintainer) on HAL-11272
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:g+oEIsEynHVc5esPoMFCFHq6hB0FrnsWUER/Ak7iQlDSQfOBS3bEa5arKkcMuGB/SDnbx2pAgANLbRUXv3XTCg==

## What changes

The run log gets a `bridge.failed` event (new requirement `events.bridge-failed`): the `agent` the
harness bridge serves, the error `kind` of `@halonicjs/std` and the error's `message`, which never
holds the run token. `events.run-log-contract` lists it among the events added since the reference.
No reference event or field changes.

`ports.harness-bridge-server` said the bridge records only model calls and Halonic tool calls. It
still does, and the recorder now also takes a `bridge.failed`, so the place that opens the bridge can
write what `reportError` hears to the run log. A new example says a `bridge.failed` compiles as a
`BridgeEvent` and the same event with a `cost` doesn't.

`engine.budget-stops` gets one example: a `bridge.failed` is written even when the budget is
reached, without asking the budget, refusing anything or stopping the call. The engine's recorder
already asked the budget only for `llm.request`, so no engine code changes.

## Why

Since #3222, the bridge answers a request that failed for a reason it doesn't name with "The run log
has the details." and tells `reportError`. Nothing wrote that to the run log yet, so the sentence
wasn't true (finding F2.6 of HAL-11247). A typed event, rather than a free-text log line, because the
engine has no free-text line in the run log, and Studio, the CLI and summaries already read typed
events. It isn't a `tool.result`: a model call isn't a tool call.

The event has no cost or token use, so a summary never adds it to the run's spend, and a failure
can't stop a run for its budget.

Studio's run log already shows every event as a numbered line with its fields, so `bridge.failed`
shows there without a code change. A purpose-made failure line would be new wording for the board.

## Tests

No test was weakened or removed. `run-event.test.ts` lists the new type; the other tests are new.

## Covers

- events.run-log-contract
- ports.harness-bridge-server
- engine.budget-stops
