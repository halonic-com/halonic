# studio.first-run-new-key-origins

- Status: active
- Since: unreleased
- Source: HAL-16409; the allowed origins of `KeyOrigins` in `@halonicjs/ports` (HAL-11871)

When the first run's Continue saves a pasted key under a secret name, the Studio app shall first remove what is stored under that name, the earlier key and the origins it was allowed to go to, so the new key starts with no allowed origins and goes only where a key with none recorded may go. A key that the first run tests from what is saved, with nothing pasted, shall keep its origins.

## Examples

- Given a workspace whose `providers/anthropic.yaml` names the secret `team-key`, and a key saved under `team-key` that may go to `https://proxy.acme.test`,
  when the first run tests and continues with a pasted Anthropic key,
  then `team-key` holds the pasted key and has no allowed origins.
- Given a key saved for Anthropic that may go to `https://proxy.acme.test`, and nothing pasted,
  when the first run tests and continues,
  then the key and its allowed origin stay as they were.
