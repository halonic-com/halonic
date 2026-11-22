# cli.run-secrets-unreadable

- Status: active
- Since: unreleased
- Source: HAL-15693 (a run stopped by a secrets file the person can't read logged no cause and asked for a bug report; follow-up to HAL-15511, decided by the team on the task with the secrets file store's own words, as HAL-12569 did for a file others can read)

When a run fails with `error` and its cause is `secrets.file-unreadable` with the file and the fix (`app.run-failure-secrets-unreadable`), `halonic run` and `halonic runs show` shall say on line 1 that the person's user account can't read that secrets file, and on line 2 give the fix `halonic secret list` gives for the same file (`secrets-file.unreadable`): `chmod 600` for `chmod`, `sudo chown` back to the person and then `chmod 600` for `chown`, and the file's Properties for `properties`, with the file written for a shell (`std.shell-word`), and no bug report line. `halonic run` shall exit 7 (`denied`), as `secret list` does, and `--json` shall carry the cause, the file and the fix in the run's `cause`.

## Examples

- Given a key in a secrets file with mode `000` that the person owns,
  when `halonic run support-reply` reads it,
  then it prints `✕ Support reply failed in the step Read the email: the secrets file <file> can't be read by your user account.` and `Run chmod 600 <file>, then run again.`, with no report link, and exits 7.
- Given the cause's fix `chown`,
  then line 2 is `It belongs to another user: run sudo chown "$(id -un)" <file>, then chmod 600 <file>, then run again.`
- Given the cause's fix `properties`,
  then line 2 is `Give your user account access to it in the file's Properties, under Security, then run again.`
