# harness-opencode.detect

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan, approved by Liam with the exact-version pin, 23 Nov 2026); docs/adr/2026-11-24-opencode-harness-program.md; HAL-18101, checked with OpenCode 2.3.0

The OpenCode harness shall find the `opencode` program through `ProgramProbe` and read the version from the first line of what `opencode --version` prints, which is `opencode` and a semver version after a `v`. When the program isn't found, it shall answer `missing`. When asking its version fails, ends with another code or prints no version in that form, it shall answer `failed` with a sentence that holds none of the program's output. When the version isn't exactly one of the tested versions, older or newer, it shall answer `unsupported` with the version and the tested versions, which name the one to install. Otherwise it shall answer `ready`: OpenCode has no sign-in in Halonic.

## Examples

- Given `opencode --version` prints "opencode v2.3.0",
  when `detect()` answers,
  then the answer is `{ status: "ready", version: "2.3.0" }`.
- Given it prints "opencode v2.3.1" or "opencode v2.2.9",
  when `detect()` answers,
  then the answer is `unsupported`, with supported "2.3.0".
- Given it prints "2.3.0" without the program's name,
  when `detect()` answers,
  then the answer is `failed`, because Halonic doesn't guess.
