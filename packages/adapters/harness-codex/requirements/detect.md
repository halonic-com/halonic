# harness-codex.detect

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan D1; HAL-2608; `ProgramProbe` agreed on HAL-2094; signed-out answer from HAL-2307; Codex facts from the fact check on HAL-2387 (rows 3, 5 and 7), checked with Codex 0.166.0 on HAL-2608; the agent's settings folder from HAL-5216 (agreed on HAL-5231)

The Codex harness shall find the `codex` program through `ProgramProbe` and read the version from the first line of what `codex --version` prints, which is `codex-cli` and a semver version, pre-release included. When the program isn't found, it shall answer `missing`. When asking its version fails, ends with another code or prints no version in that form, it shall answer `failed` with a sentence that holds none of the program's output. When the version is older than the oldest supported one, in semver order, it shall answer `unsupported` with the version and the supported range. Otherwise it shall ask `codex login status` (with `CODEX_HOME` set to the agent's settings folder when `detect()` is given one, so the answer is that agent's sign-in), and answer `signed-out` only when that exits with 1 and one of its lines is exactly "Not logged in"; any other answer shall be `ready`. No answer shall hold the program's output.

## Examples

- Given `codex --version` prints "codex-cli 0.167.0" and `codex login status` exits with 0,
  when `detect()` answers,
  then the answer is `{ status: "ready", version: "0.167.0" }`.
- Given `codex login status` exits with 1 and prints "Not logged in",
  when `detect()` answers,
  then the answer is `{ status: "signed-out", version: "0.167.0" }`.
- Given `codex --version` prints "codex-cli 0.166.0-alpha.3",
  when `detect()` answers,
  then the answer is `unsupported`, with supported ">=0.166.0", and `login status` isn't asked.
- Given `codex login status` exits with 1 and prints "Error loading configuration: …",
  when `detect()` answers,
  then the answer is `ready`, because Halonic doesn't guess.
- Given `detect()` is given the agent's settings folder,
  when it asks for the sign-in,
  then `codex login status` runs with `CODEX_HOME` set to that folder, and `codex --version` without it.
