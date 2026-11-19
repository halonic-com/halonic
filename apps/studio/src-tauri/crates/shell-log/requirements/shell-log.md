# studio.src-tauri.crates.shell-log.shell-log

- Status: draft
- Since: unreleased
- Source: HAL-11253, HAL-13251 (whole printed lines)

When the shell records an error, it shall write one line, the time in UTC, where it comes from and what happened, to `studio/shell.log` in the profile, as well as to stderr, so that a release build without a console keeps it. A line shall hold no line break, and a message longer than 4 KiB shall be cut and marked. When the file would grow past 1 MiB, the shell shall rename it to `shell.log.1`, replacing an older one, and start a new file. The file shall be readable and writable by its owner only on macOS and Linux. A line the shell records itself shall name things and give error kinds; it shall never hold a secret's value or a token. A line the agent host or `wsl.exe` prints on stderr shall be recorded as printed, except that a line holding text shaped like a key (the formats `findSecretShape` in `@halonicjs/std` spots) shall be replaced by a note that names the key's kind. The key-shape check shall see each printed line whole, however many reads it takes to come in; of a printed line longer than 64 KiB, only the first 64 KiB shall be kept.

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
- Given the agent host prints `Error: 401 for sk-ant-` followed by a key,
  when the line is recorded,
  then the line is `agent host: (a line was left out: it held text shaped like a key (ai-provider-key))`, and the key is not in the file.
- Given a new log file on macOS or Linux,
  when it is created or set aside,
  then its mode is `0600`.
