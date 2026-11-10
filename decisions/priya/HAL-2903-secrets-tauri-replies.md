# Decision: the Tauri secrets refuse malformed replies and refusals that hold the value

- Requirements: `secrets-tauri.shell-commands` and `secrets-tauri.refusals`
  (`packages/adapters/secrets-tauri/requirements/`)
- Task: HAL-2903, from the attack tests on HAL-2899
- Approval: HAL-2903 asks for these changes to both requirements; the reviewer (Liam) approves this note in review

## What changes

Both requirements get stricter. Nothing either one promised before is taken away.

- `shell-commands`: an answer to `secret_get` of `""` is refused as `backend`, like any other
  answer that isn't a value. An answer to `secret_set` or `secret_delete` other than `null` is
  refused as `backend` instead of taken for success.
- `refusals`: only a plain object counts as the shell's refusal, so an `Error` that carries a
  `kind` is a failure whose text is dropped. A refusal of `secret_set` whose message holds the
  value keeps its kind but loses its message.

## Why

Today's shell can't cause any of these: `crates/secrets` keeps the value out of its messages,
never stores an empty value, and answers set and delete with `()`, which reaches the page as
`null`. The page still shouldn't trust each reply blindly. A refusal could print a value into a
log, `""` could pass for a set secret, and `{ stored: false }` could pass for a stored one.

`""` is refused rather than kept, because the shell's value rule refuses an empty value on
`secret_set`, so an empty answer can only come from a broken or foreign shell.

No test was weakened. The new tests are in `src/hardening.test.ts`.

## Covers

- secrets-tauri.shell-commands
- secrets-tauri.refusals
