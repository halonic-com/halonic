# halonic-shell-log

The Studio shell's own log. A release build on Windows has no console (`windows_subsystem = "windows"`), so what the shell printed to stderr went nowhere. The shell records it here instead, in `studio/shell.log` in the profile, where the person, a "copy details" action or the doctor can read it.

- `start(file)`: names the file once, when the shell starts. Until then, and in tests, a record goes to stderr only.
- `record(source, message)`: one line, `<UTC time> <source>: <message>`, in the log and on stderr. Line breaks become spaces, and a message over 4 KiB is cut and marked.
- `record_printed(source, line)`: a line another program printed, such as the agent host or `wsl.exe` on stderr, as printed. A line holding text shaped like a key is left out, and the log names the key's kind instead.
- The file is capped at 1 MiB: past that it is renamed to `shell.log.1`, replacing an older one, and a new file starts.
- On macOS and Linux the file is created with mode `0600`, so only its owner can read it. On Windows it takes the profile folder's access list.

What a line may hold:

- **The shell's own records** name things and give error kinds. They never hold a secret's value or a token: the keychain commands log their command and the error's kind, and `SecretError` messages never hold the value.
- **Lines the agent host or `wsl.exe` print** are recorded as printed, since the shell can't vouch for them. The host keeps the values it knows out of what it prints (a failed connector request is logged without the connector's secret values), but a library or a plugin inside the host can print anything. So `record_printed` also leaves out every line with text shaped like a key, using the same formats as `findSecretShape` in `@halonicjs/std`, which the chats and the engine's run records use. A value with no known shape, such as an OAuth refresh token, is not caught by that check. That is why the file is readable by its owner only.
