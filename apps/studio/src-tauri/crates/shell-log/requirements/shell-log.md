# studio.src-tauri.crates.shell-log.shell-log

- Status: draft
- Since: unreleased
- Source: HAL-11253

When the shell records an error, it shall write one line, the time in UTC, where it comes from and what happened, to `studio/shell.log` in the profile, as well as to stderr, so that a release build without a console keeps it. A line shall hold no line break, and a message longer than 4 KiB shall be cut and marked. When the file would grow past 1 MiB, the shell shall rename it to `shell.log.1`, replacing an older one, and start a new file. A line shall name things and give error kinds; it shall never hold a secret's value or a token.

## Examples

- Given the source `engine_lock` and the message `renewing the lock: denied`,
  when it is recorded at 2026-11-18 11:06:40 UTC,
  then the line is `2026-11-18T11:06:40Z engine_lock: renewing the lock: denied`.
- Given a log file of 9 bytes with a cap of 10 bytes,
  when a line of 9 bytes is recorded,
  then the old file becomes `shell.log.1` and the new file holds only the new line.
- Given a keychain call that fails while storing a value,
  when it is recorded,
  then the line names the command and the kind and doesn't contain the value.
