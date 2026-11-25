# engine.meter-call-id

- Status: active
- Since: unreleased
- Source: HAL-18109, a follow-up from the Cloudflare meter's plan (HAL-18024, point 4); builds on `engine.meter-port`

The model call usage the engine makes for the meter shall carry a `callId`: `<runId>:<seq>` of the call's `llm.response` in the run log. The same logged call shall always get the same `callId`, and two different logged calls shall never share one, so a meter that keeps the ids it has recorded can count a call that is recorded twice only once.

## Examples

- Given an `llm.response` at `seq` 7 of run `r-acme`,
  when the meter's usage of it is made,
  then its `callId` is `r-acme:7`.
- Given the same `llm.response`,
  when the meter's usage of it is made twice,
  then both have the same `callId`.
- Given `llm.response` events at `seq` 7 and 9 of run `r-acme` and at `seq` 7 of run `r-acme-child`,
  when the meter's usage of each is made,
  then their three `callId`s differ.
