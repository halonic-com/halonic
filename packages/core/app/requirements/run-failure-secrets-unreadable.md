# app.run-failure-secrets-unreadable

- Status: active
- Since: unreleased
- Source: HAL-15693 (a run stopped by a secrets file the person can't read logged no cause; follow-up to HAL-15511, as HAL-12569 did for a file others can read)

When a run fails with `error` and the cause of its `run.failed` is `secrets.file-unreadable` with the file and a fix of `chmod`, `chown` or `properties` (requirement `secrets-file.unreadable-cause`), the app shall give the facts `secrets-file-unreadable` with the file and that fix, and the cause shall count as setup (`isSetupCause`), so a client treats the run by the cause's own kind, `denied`. A cause without the file, or with a fix the app doesn't know, shall give the facts `error`.

## Examples

- Given a run that failed with `error` and the cause `secrets.file-unreadable` for the file `/profile/secrets/secrets.json` with the fix `chown`,
  when its facts are read,
  then they are `secrets-file-unreadable` with that file and the fix `chown`, and the cause counts as setup.
- Given the same cause without the fix,
  when its facts are read,
  then they are `error`, and the cause doesn't count as setup.
