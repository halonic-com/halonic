# Decision: a run that used its agent's model call limit says so, in model call words

- Task: HAL-15331
- Approval: team decision under the HAL-2282 rule for small wording on approved screens (Iris's flow check C561, finding 2, on HAL-15313); the reviewer of the pull request on HAL-15331 signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Q/XSWkLwAy5vne+HeJ+sc389HHw2FpD85IOciE0aVS9z+KVA9MYMZk/3hPFcb89O0MMVACqnC4URoDTUxy6KCQ==

## What changes

- `engine.run-step-limit`: the error says "used all *n* of its model calls (maxSteps)", or "used its only model call (maxSteps)" for a limit of 1, instead of "used all *n* of its steps (maxSteps)". The error now has the kind `limit_reached` and the cause `engine.turn-limit` with the agent and the limit. The rule itself (the call fails, the state fails the run, a `parallel` branch ends with the error) and its example stay; the example also checks the cause.
- `app.run-failure`: an `error` whose cause is `engine.turn-limit` is `turn-limit` with the agent, the limit and the file `<agent>.agent.yaml`, and doesn't count as setup, so the run keeps a failed run's exit code. A new example says so. Nothing else in the requirement changes.

So `halonic run` and `halonic runs show` print the lines HAL-14710 already worded ("*looper* used all *2* model calls without finishing." and "Raise its model call limit (maxSteps) in *looper.agent.yaml* if it needs more.") instead of "Halonic can't tell the cause yet". Line 2 now names the field to edit, since the file doesn't say "model call limit".

## Why

The same limit had three names: "steps (maxSteps)" in a run, "Model call limit" on the agent's Model page and in Settings › Assistant, and nothing in the docs. "Steps" also clashed with workflow steps. Nothing produced the `turn-limit` facts, so the CLI's lines for it never showed in a real run and the user was asked to report a bug for a limit they set.

## Covers

- engine.run-step-limit
- app.run-failure
