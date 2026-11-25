# opencode-diff.diff

- Status: active
- Since: unreleased
- Source: HAL-18680; the version-bump checklist in docs/adr/2026-11-24-opencode-harness-program.md (item 2, the config diff)

When it is given two OpenCode versions, the diff shall download each version's Linux program package (`@opencode/cli-linux-x64`) and config schema package (`@opencode/schema`) with `npm pack`, run none of their scripts, and print as Markdown: each program package's integrity, the `OPENCODE_*` names in one version's program and not the other's, and the config schema keys in one version and not the other. A config schema key shall be a field of the schema module `config.js` or of a module it imports, directly or not, written as `<module>: <key>`, without the schemas' annotations. Where two names run together in the program's text, each place `OPENCODE_` starts again shall start a new name. When nothing changed in a list, the diff shall say so with the new version's count.

## Examples

- Given 2.3.0 and 2.4.1,
  when the diff runs,
  then it lists `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT` as added and `config.js: automations` among the added keys.
- Given a program whose text holds `OPENCODE_PTY_SOCKET_DIROPENCODE_PTY_SOCKET_DIR`,
  when the diff reads its names,
  then it finds `OPENCODE_PTY_SOCKET_DIR` once.
- Given a schema module with a field annotated with a `description`,
  when the diff reads its keys,
  then the field is listed and `description` isn't.
- Given a schema package without `config.js`,
  when the diff reads it,
  then it stops with an error that says the package's layout changed.
