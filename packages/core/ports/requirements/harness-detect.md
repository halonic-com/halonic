# ports.harness-detect

- Status: active
- Since: 0.1.0
- Source: plan HAL-9 section 4.5 (v1.17), "Harness" port; HAL-1484

The `Harness` port shall let a harness say, through `detect()`, whether its program is installed, which version it is and whether that version is supported, with enough detail for Studio to name the harness and say what is wrong.

## Examples

- Given a harness whose program isn't installed,
  when `detect()` answers,
  then the answer is `{ status: "missing" }` and the harness's `name` reads "Codex", so Studio can say "Codex isn't installed".
- Given a harness whose program is installed in a version Halonic doesn't support,
  when `detect()` answers,
  then the answer holds the installed `version` and the `supported` versions.
- Given a `ready` answer without a `version`,
  when it is compiled,
  then it doesn't compile.
