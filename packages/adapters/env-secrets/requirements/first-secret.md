# env-secrets.first-secret

- Status: active
- Since: 0.1.0
- Source: HAL-2109

The chained secrets made by `firstSecret` shall ask each store in the order given and give the first value that isn't `null`, or `null` when no store has one. When a store throws, they shall stop and reject with that error unchanged. They shall refuse a name that breaks the `Secrets` name rule with a `RangeError` before any store is asked.

## Examples

- Given the environment has `openai` and the keychain has it too,
  when `openai` is read,
  then it gives the environment's value and the keychain is not asked.
- Given only the keychain has `openai`,
  when `openai` is read,
  then it gives the keychain's value.
- Given the first store throws,
  when a secret is read,
  then it rejects with the same error and later stores are not asked.
- Given the name `bad name`,
  when it is read,
  then it rejects with a `RangeError` and no store is asked.
