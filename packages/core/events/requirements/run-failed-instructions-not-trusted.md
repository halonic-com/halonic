# events.run-failed-instructions-not-trusted

- Status: active
- Since: 0.1.0
- Source: HAL-10524 (G1); approved on HAL-10560

The events package shall let a `run.failed` event give the reason `instructions-not-trusted` when a harness step didn't start because a person hasn't trusted the agent's instructions, or they changed since. It shall name the agent in an optional `agent`, the pin the check saw in an optional `pin` (the digest of the set and each file's digest by name, never the text) and whether a person had trusted instructions for the agent before in an optional `changed`, so a page can offer to trust exactly that pin and say "changed" or "not trusted yet" without asking the store again. `changed` is absent when the check didn't answer. A parallel branch that fails the same check ends with `agent.finished` and the same `reason`, `pin` and `changed`. A reader that doesn't know the reason still shows the `error` text. Logs written before the fields existed read as before.

## Examples

- Given the reason type,
  when it is listed,
  then it includes `instructions-not-trusted`.
- Given a `run.failed` event with `reason: "instructions-not-trusted"`, an `agent`, a `pin` and `changed: true`,
  when its type is checked,
  then it is a valid run event.
- Given an `agent.finished` event with `reason: "instructions-not-trusted"`, a `pin` and `changed: false`,
  when its type is checked,
  then it is a valid run event.
