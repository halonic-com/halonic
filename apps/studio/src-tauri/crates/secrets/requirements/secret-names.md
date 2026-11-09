# studio.src-tauri.crates.secrets.secret-names

- Status: draft
- Since: 0.1.0
- Source: HAL-192, HAL-1508, HAL-99 (the `Secrets` port)

When the shell receives a secret's name, it shall accept it only if it matches `^[A-Za-z][A-Za-z0-9_-]*$` with at most 128 characters, and shall store it in canonical form, lower case with `-` turned into `_`, under the keychain service `halonic`, the same form and service the CLI uses. If the name breaks the rule, then the shell shall report `invalid_name` without touching the keychain.

## Examples

- Given the names `Google-Refresh` and `google_refresh`,
  when they are checked,
  then both are stored as `google_refresh`.
- Given the name `token.key` or `1token`,
  when it is checked,
  then the result is `invalid_name`.
- Given the shared cases in `tests/fixtures/canonical-names.tsv`,
  when they go through the shell's canonical function,
  then each gives the form the CLI's `canonicalTokenName` gives.
