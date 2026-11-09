# env-secrets.value-never-shown

- Status: active
- Since: 0.1.0
- Source: HAL-2109

The environment secrets and the chained secrets shall never put a secret's value in an error message, and shall not log.

## Examples

- Given configured secrets,
  when a name that breaks the rule is read,
  then the `RangeError` message names the secret and holds none of the values.
- Given configured secrets,
  when any secret is read,
  then nothing is written to the console.
