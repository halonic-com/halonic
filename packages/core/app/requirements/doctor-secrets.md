# app.doctor-secrets

- Status: active
- Since: unreleased
- Source: HAL-14269, from the config check C337 on HAL-14257 (rows 8 and 10, code row C14) and C340 on HAL-14271 (row 13); wording built on the approved C336 form, decided by the team (Liam)

While it runs inside a workspace, `halonic doctor` shall check each secret a run there needs that the Models line doesn't check: the secrets of the connectors an agent uses, and the secret of a provider the aliases use that the Models line doesn't check for a key, such as the test model or a model server on this computer, and the webhook secret of each enabled routine. While one of them isn't set, `doctor` shall show a Secrets line marked as failed, with one entry per missing secret that names the secret and what uses it, so the command exits 1. It shall read each secret only to learn whether it is set, through the same store a run reads, and never show its value. When the store can't be asked about a secret, such as a locked keychain, `doctor` shall still finish, with that secret on the Secrets line marked as a warning; a missing secret still marks the line as failed. While every secret is set, or outside a workspace, there shall be no Secrets line.

## Examples

- Given the agent Helper uses the connector `files`, whose `secretEnv` names the secret `files-token`, and that secret isn't set,
  then the Secrets line is ✕ and names `files-token` and the connector `files`, and `doctor` exits 1.
- Given the default alias uses the provider `mock`, whose `secret` is `mock-key`, and that secret isn't set,
  then the Secrets line is ✕ and names `mock-key` and the provider `mock`.
- Given the enabled routine `friday-digest` has a webhook trigger whose secret `friday-hook` isn't set,
  then the Secrets line is ✕ and names `friday-hook` and the routine `friday-digest`.
- Given both secrets are set,
  then there is no Secrets line.
- Given a connector that no agent uses names a secret that isn't set,
  then there is no Secrets line.
- Given the store throws when asked about `files-token`,
  then `doctor` finishes, the Secrets line is ! and names `files-token`, and `doctor` exits 0 unless another line fails.
