# Decision: wire the local request log from the engine to the Build chat

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19291 (the task's plan, with Julian's security conditions on it; Liam approves this note in review, and Julian gives his security OK on the task)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:41CR0os/bnaG1d1yC0BajywJZvvkBvzmHjP7Y6rph042uxbNIqZjMmMTPKLYs2YMQ9ow1obrMrbJXSOPg9AFAQ==

The CLI's engine now keeps each local integration's requests in the profile, and a trusted Build chat about that integration reads them through the agent host. Three requirements change with it, each only stricter:

- `app.integration-request-log`: one write looks for at most 64 segments that aren't plain words in the code, and for each distinct one once (Julian's condition 1 on HAL-19291). A forgotten workspace stays forgotten in the store, so an integration still loaded can't write its folder again (condition 2).
- `assistant.build.read-request-log`: each line is cut to 500 characters, and a failed read answers a fixed sentence, never the error, because a thrown error reaches the model outside the fence (Liam's and Julian's notes on #6405).
- `cli.open-local-integration`: the command keeps the log under the workspace folder's key, through one store per profile in its process.

The requirements are still `Since: unreleased`, so no released behaviour changes.

## Covers

- app.integration-request-log
- assistant.build.read-request-log
- cli.open-local-integration
