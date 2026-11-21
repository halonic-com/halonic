# cli.doctor-secrets

- Status: active
- Since: unreleased
- Source: HAL-15261 (a local integration's secret picks, from flow check 38's C552 finding 2 on HAL-15218, a team decision on the task, with the words of the connector example below); HAL-15086 (the key a harness agent's run gets, from Nina's C536 G1 on HAL-15070, a team decision on the task, with this line's own words); HAL-14269, from the config check C337 on HAL-14257 (rows 8 and 10, code row C14) and C340 on HAL-14271 (row 13); the words in the form of the Models line's key line and the approved C336 form, decided by the team (Liam)

The `halonic doctor` command shall read from the workspace's files the secrets a run needs that the Models line doesn't check: an HTTP connector's `secret`, a program connector's `secretEnv` and the workspace secret each secret of a local integration's sheet gets (its connector's `secrets`), for each connector an agent names in `connectors` that its hub can see, and the `secret` of each provider the aliases use that the Models line doesn't check for a key, such as the test model or a provider with `local: true`, and the webhook `secret` of each enabled routine. It shall also read the `secret` of each provider whose key `halonic run`'s key services would give a harness agent's run in any hub, as the Harnesses line decides it (`app.doctor-agent-sign-in`), such as the only keyed provider of its program's type for an agent without a `model`, used by that provider, when the Models line doesn't check that key. It shall compare names as the secret store does, so names that differ only in case or in `-` and `_` are one secret, shown as first written. A secret the Models line checks as a cloud provider's key is left out, whatever else uses it, so no secret is named twice. It shall ask the store through the same check a run uses, so a name a run refuses is never reported as set. For each of those secrets that isn't set, it shall show a line under Secrets, after Models and before Sandbox, marked with ✕, that names the secret, what uses it and the command that sets it, and `doctor` shall exit with 1. It shall never show a secret's value. For each of those secrets the store couldn't be asked about, it shall show a line under Secrets marked with !, that names the secret and what uses it, and finish. With `--json`, the check shall be `secrets`, with each missing and each unreadable secret and what uses it.

## Examples

- Given the agent Helper names the connector `files`, whose `secretEnv` gives it the secret `files-token`, and that secret isn't set,
  when `halonic doctor` runs,
  then it prints "✕ Secrets     files-token isn't set (connector files) · halonic secret set files-token" and exits with 1.
- Given the agent Writer names the connector `notes`, which runs the local integration in `integrations/notes` and gives the sheet's secrets notes-key and sync-key the workspace secret my-notes-key, and that secret isn't set,
  when `halonic doctor` runs,
  then it prints "✕ Secrets     my-notes-key isn't set (connector notes) · halonic secret set my-notes-key" and exits with 1.
- Given the default alias uses the provider `mock`, of type `mock`, whose `secret` is `mock-key`, and that secret isn't set,
  when `halonic doctor` runs,
  then it prints "✕ Secrets     mock-key isn't set (provider mock) · halonic secret set mock-key" and exits with 1.
- Given the enabled routine `friday-digest` has a webhook trigger whose `secret` is `friday-hook`, and that secret isn't set,
  when `halonic doctor` runs,
  then it prints "✕ Secrets     friday-hook isn't set (routine friday-digest) · halonic secret set friday-hook" and exits with 1.
- Given those secrets are set, the connector `files` is one no agent names, or the routine `friday-digest` has `enabled: false`,
  when `halonic doctor` runs,
  then there is no Secrets line.
- Given the connector `files` uses `files-token` and the connector `notes` uses `FILES_TOKEN`, and neither is set,
  when `halonic doctor` runs,
  then it prints one line: "✕ Secrets     files-token isn't set (connectors files and notes) · halonic secret set files-token".
- Given the root agent Writer two uses Claude Code without a `model` and runs in the sandbox, the provider `claude` of type `anthropic` with the secret `anthropic-key` is the only keyed Anthropic provider, no alias uses it, and the secret isn't set,
  when `halonic doctor` runs,
  then it prints "✕ Secrets     anthropic-key isn't set (provider claude) · halonic secret set anthropic-key" and exits with 1, since the run would stop on the missing key.
- Given the connector `files` uses the secret `anthropic-key` of the cloud provider `anthropic`, and it isn't set,
  when `halonic doctor` runs,
  then the Models line names the missing key and there is no Secrets line.
- Given the secret store throws when asked about `files-token`,
  when `halonic doctor` runs,
  then it prints "! Secrets     couldn't read files-token from the secret store (connector files)" and still prints every other line.
