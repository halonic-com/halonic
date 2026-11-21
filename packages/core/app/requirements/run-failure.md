# app.run-failure

- Status: active
- Since: unreleased
- Source: HAL-12377 (a model alias the hub doesn't have, decided by the team on the task); HAL-12342 (a provider type Halonic can't call, decided by Liam on the task); HAL-12411 (the CLI's failure facts move into `@halonicjs/app`, so Studio's run page and the CLI name the same facts, rule E4 of the UX check on HAL-12390); HAL-12464 (approved by Liam: the facts are data, never words, and the CLI's output stays the same); HAL-12569 (a secrets file other users can read, decided by the team on the task); HAL-13862 (a bridge socket path that is too long has a known cause); HAL-12411 (a key failure names the model when no alias points at it, C457-1 on HAL-14694, a team decision under HAL-2282)

The app shall give a failed run's facts from the reason its `run.failed` event names and from the model the run called last, the one named by the last `llm.request`, `llm.fallback` or `llm.skipped` in its log, with that model's alias, provider file and provider address from the workspace. The facts shall be data, never words: a wait in milliseconds, a monthly budget's reset as an ISO date (UTC), and a harness program by its id. A provider shall be named as its file names it, or else by its id. `key-refused` shall be `no-key` when the run skipped that model because its key isn't set and had no other model left. Both key failures shall name the provider's secret, the model the provider was asked for and its alias, or `<provider>/<model>` as the alias when no alias points at the model, so a client names the model instead. A cancelled run shall have no failure facts. A reason whose facts the run log doesn't hold shall be `error` with the engine's own message, and `disk-full`, `interrupted` and `answer-not-an-option` shall also say their cause is known. An `error` whose cause is `models.unknown-provider-type` with the provider and its type shall be `unknown-provider-type` with both. An `error` whose cause is `models.unknown-model-alias` with the alias and the hub shall be `unknown-model-alias` with both. An `error` whose cause is `secrets.file-readable` with the file shall be `secrets-file-readable` with the file. All three causes shall count as setup, so a client can treat the run by the cause's own kind. An `error` whose cause is `harness-bridge.socket-path-too-long` shall keep the engine's message and say its cause is known.

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
- Given a run that failed with `error` and the cause `models.unknown-model-alias` for the alias `default` in the hub `notes`,
  when its facts are read,
  then they are `unknown-model-alias` with the alias `default` and the hub `notes`, and the cause counts as the workspace's setup.
- Given a run that failed with `error` and the cause `secrets.file-readable` for the file `/profile/secrets/secrets.json`,
  when its facts are read,
  then they are `secrets-file-readable` with that file, and the cause counts as setup.
- Given a run that failed with `error` and the cause `harness-bridge.socket-path-too-long`,
  when its facts are read,
  then they are `error` with the engine's own message, and its cause is known.
- Given a run that failed with `model-unreachable` after calling a model whose provider file is gone,
  when its facts are read without a host in the event,
  then they are `error` with the engine's own message.
