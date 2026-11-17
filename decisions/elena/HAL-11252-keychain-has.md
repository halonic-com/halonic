# Decision: the Tauri secrets also ask the shell whether a name is stored, without reading the value

- Requirements: `secrets-tauri.shell-commands`
- Task: HAL-11252
- Approval: Liam approved adding `has` and the shell's `secret_has` on HAL-11252 (PR #3237, code review at 2f4c63a)
- Kind: internal

## What changes

`secrets-tauri.shell-commands` gains one command and one rule. The Tauri secrets now call `secret_has`
as well as `secret_get`, `secret_set` and `secret_delete`, and `has` answers yes or no without the value
ever reaching the page. An answer to `secret_has` that is not `true` or `false` is malformed and rejects
with a `KeychainError` of refusal `backend`, the same rule the other commands already follow.

Nothing is weakened: every existing sentence and example stays, and two examples come in (a stored name
answers `true` with no value; a malformed answer is refused). Users see no change. The Studio asks fewer
questions that read a secret's value, which is the point of audit finding F4 on HAL-11252.

## Covers

- secrets-tauri.shell-commands
