# secrets-file.unreadable

- Status: active
- Since: unreleased
- Source: HAL-15511 (C585 B1: `halonic secret list` asked for a bug report for a secrets file its owner can't read)

When the person running Halonic may not read the secrets file (the file system refuses it with `EACCES` or `EPERM`), the file secret store shall refuse with a `denied` error that names the file and a fix, instead of the file system's error, and never a value. On Linux and macOS the fix shall be `chmod 600 <file>` when the person owns the file, and `sudo chown` back to the person followed by `chmod 600 <file>` when another user owns it, with the file written for a shell (`std.shell-word`). On Windows the fix shall be to give the person's account access in the file's properties. The file system's error shall stay the refusal's `cause`, for `--debug`.

## Examples

- Given a secrets file with mode `000` that the person owns, then `get`, `names`, `set` and `remove` each refuse with `The secrets file <file> can't be read by your user account.` and the fix `Run chmod 600 <file>, then run again.`, and `set` doesn't change the file.
- Given a secrets file owned by another user, then the fix is `It belongs to another user: run sudo chown "$(id -un)" <file>, then chmod 600 <file>, then run again.`
- Given a secrets file in `/srv/acme/Application Support/secrets/`, then the fix writes the file in double quotes.
- Given Windows, then the fix says to give the account access in the file's Properties, under Security.
