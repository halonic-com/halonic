# ports.harness-signed-out

- Status: active
- Since: 0.1.0
- Source: HAL-2307 (a signed-out `detect()`), harness states H3 on HAL-2350, fact check on HAL-2387; task HAL-2552

The `Harness` port shall let `detect()` say that a harness's program is installed in a supported version but that no one is signed in to it on this computer, with the version it found, so Studio, `halonic doctor` and `halonic run` can name the harness and say "not signed in" before a run starts.

## Examples

- Given Claude Code 2.1.321 is installed and its sign-in check says no one is signed in,
  when `detect()` answers,
  then the answer is `{ status: "signed-out", version: "2.1.321" }`.
- Given a `signed-out` answer without a `version`,
  when it is compiled,
  then it doesn't compile.
