# secrets-file.unreadable-cause

- Status: active
- Since: unreleased
- Source: HAL-15693 (a run stopped by a secrets file the person can't read logged no cause; follow-up to HAL-15511, as HAL-12569 did for a file others can read)

When the file secret store refuses a secrets file the person may not read (`secrets-file.unreadable`), the refusal shall carry the cause `secrets.file-unreadable` with the file and the kind of fix it gives: `chmod` when the person owns the file, `chown` when another user owns it, `properties` on Windows. So a run it stops logs a cause the command line and Studio can word (`engine.run-failure-cause-of`). The cause shall name neither a secret nor a value.

## Examples

- Given a secrets file with mode `000` that the person owns, then `get` refuses with the cause `secrets.file-unreadable`, the file and the fix `chmod`.
- Given a secrets file owned by another user, then the cause's fix is `chown`.
- Given Windows, then the cause's fix is `properties`.
