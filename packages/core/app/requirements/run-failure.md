# app.run-failure

- Status: active
- Since: unreleased
- Source: HAL-12342 (a provider type Halonic can't call, decided by Liam on the task); HAL-12411 (the CLI's failure facts move into `@halonicjs/app`, so Studio's run page and the CLI name the same facts, rule E4 of the UX check on HAL-12390); HAL-12464 (approved by Liam: the facts are data, never words, and the CLI's output stays the same)

The app shall give a failed run's facts from the reason its `run.failed` event names and from the model the run called last, the one named by the last `llm.request`, `llm.fallback` or `llm.skipped` in its log, with that model's alias, provider file and provider address from the workspace. The facts shall be data, never words: a wait in milliseconds, a monthly budget's reset as an ISO date (UTC), and a harness program by its id. A provider shall be named as its file names it, or else by its id. `key-refused` shall be `no-key` when the run skipped that model because its key isn't set and had no other model left. A cancelled run shall have no failure facts. A reason whose facts the run log doesn't hold shall be `error` with the engine's own message, and `disk-full`, `interrupted` and `answer-not-an-option` shall also say their cause is known. An `error` whose cause is `models.unknown-provider-type` with the provider and its type shall be `unknown-provider-type` with both.

## Examples

- Given a run that failed with `model-timeout` after calling `llama3.2` at Ollama on `localhost:11434`,
  when its facts are read,
  then they name Ollama, a wait of 300000 ms and the local address `localhost:11434`.
- Given a run that failed with `budget` on 31 December 2026 with the error `Monthly budget reached: 0.60 of 0.50 USD spent this month.`,
  when its facts are read,
  then the budget resets on `2027-01-01`.
- Given a run that failed with `harness-start-failed` in a step whose `harness.started` names `claude-code` with a timeout of 60000 ms,
  when its facts are read,
  then they name the harness `claude-code` and a wait of 60000 ms.
- Given a run that failed with `error` and the cause `models.unknown-provider-type` for the provider `weird` of type `carrier-pigeon`,
  when its facts are read,
  then they are `unknown-provider-type` with the provider `weird` and the type `carrier-pigeon`.
- Given a run that failed with `model-unreachable` after calling a model whose provider file is gone,
  when its facts are read without a host in the event,
  then they are `error` with the engine's own message.
