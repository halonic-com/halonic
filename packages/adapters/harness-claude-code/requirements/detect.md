# harness-claude-code.detect

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C1; HAL-2552; `ProgramProbe` agreed on HAL-2094; sign-in check from HAL-2307 and the fact check on HAL-2387; the agent's settings folder from HAL-5216 (agreed on HAL-5231)

The Claude Code harness shall find the `claude` program through `ProgramProbe` and read the leading `X.Y.Z` of what `claude --version` prints. When the program isn't found, it shall answer `missing`. When asking its version fails, ends with another code or prints no version, it shall answer `failed` with a sentence that holds none of the program's output. When the version is older than the oldest supported one, it shall answer `unsupported` with the version and the supported range. Otherwise it shall ask `claude auth status` (with `CLAUDE_CONFIG_DIR` set to the agent's settings folder when `detect()` is given one, so the answer is that agent's sign-in), and answer `signed-out` only when that exits with 1 and its JSON says `loggedIn` is false; any other answer shall be `ready`.

## Examples

- Given `claude --version` prints "2.1.321 (Claude Code)" and `claude auth status` exits with 0,
  when `detect()` answers,
  then the answer is `{ status: "ready", version: "2.1.321" }`.
- Given `claude auth status` exits with 1 and prints `{"loggedIn": false}`,
  when `detect()` answers,
  then the answer is `{ status: "signed-out", version: "2.1.321" }`.
- Given `claude --version` prints "2.1.200 (Claude Code)",
  when `detect()` answers,
  then the answer is `unsupported`, with version "2.1.200" and supported ">=2.1.311", and `auth status` isn't asked.
- Given `claude auth status` exits with 1 and prints a usage message,
  when `detect()` answers,
  then the answer is `ready`, because Halonic doesn't guess.
- Given `detect()` is given the agent's settings folder,
  when it asks for the sign-in,
  then `claude auth status` runs with `CLAUDE_CONFIG_DIR` set to that folder, and `claude --version` without it.
