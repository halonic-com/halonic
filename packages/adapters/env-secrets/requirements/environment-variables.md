# env-secrets.environment-variables

- Status: active
- Since: 0.1.0
- Source: HAL-2109; `Secrets` port v1

The environment secrets shall give the value of the variable `HALONIC_SECRET_` followed by the secret's name in upper case with `-` as `_`, from the environment they are given, and `null` when that variable is unset or empty. When a name breaks the secret name rule, `get` shall reject with a `RangeError` before it reads the environment.

## Examples

- Given `HALONIC_SECRET_SERVE_PASSWORD=hash`,
  when `serve-password`, `SERVE_PASSWORD` or `serve_password` is read,
  then it gives `hash`.
- Given `HALONIC_SECRET_SERVE_PASSWORD` set to an empty value,
  when `serve-password` is read,
  then it gives `null`.
- Given the name `bad name`,
  when it is read,
  then it rejects with a `RangeError` and no variable is read.
