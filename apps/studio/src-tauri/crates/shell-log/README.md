# halonic-shell-log

The Studio shell's own log. A release build on Windows has no console (`windows_subsystem = "windows"`), so what the shell printed to stderr went nowhere. The shell records it here instead, in `studio/shell.log` in the profile, where the person, a "copy details" action or the doctor can read it.

- `start(file)`: names the file once, when the shell starts. Until then, and in tests, a record goes to stderr only.
- `record(source, message)`: one line, `<UTC time> <source>: <message>`, in the log and on stderr. Line breaks become spaces, and a message over 4 KiB is cut and marked.
- The file is capped at 1 MiB: past that it is renamed to `shell.log.1`, replacing an older one, and a new file starts.

A record names things and gives error kinds. It never holds a secret's value or a token: the keychain commands log their command and the error's kind, and `SecretError` messages never hold the value.
