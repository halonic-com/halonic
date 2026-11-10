# secrets-tauri.shared-names

- Status: active
- Since: 0.1.0
- Source: HAL-2611; `apps/studio/src-tauri/crates/secrets/requirements/secret-names.md`

The Tauri secrets shall refuse exactly the names in the shell's shared fixture `tests/fixtures/canonical-names.tsv` marked `INVALID`, before sending anything, and send every other name in it to the shell, so the page and the shell never disagree on a name.

## Examples

- Given the fixture line `token.key` marked `INVALID`,
  when it is read,
  then it rejects with a `RangeError` and the shell receives no call.
- Given the fixture line `Serve-Password` with the form `serve_password`,
  when it is read,
  then the shell receives `secret_get` with `Serve-Password`.
