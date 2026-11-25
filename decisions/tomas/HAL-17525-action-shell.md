# Decision: the secret commands also refuse a stepper's sign-in (`action__` names)

- Task: HAL-17525
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17525 (security PR: Julian reviews security, Liam signs)
- Kind: internal

## What changes

The shell keeps a user-only action stepper's sign-in in the OS keychain: the user's own token under
`action__<service>__<account>`, and the account it belongs to under `action__<service>`
(architecture note on HAL-17491, section 3). `SecretName::is_halonic` in `halonic-secrets` now also
counts every name that starts with `action__`. So `secret_get`, `secret_has`, `secret_set` and
`secret_delete` refuse those names with `reserved_name` before the backend runs. So do the engine's
secret broker and the agent host's secrets channel, which use the same rule.

The requirement `studio.src-tauri.crates.secrets.secret-commands` gains the prefix in its list of
names that belong to Halonic. Its test `secret_commands_refuse_halonic_names_before_the_backend`
gains three `action__` cases. No test was weakened or skipped.

## Why

The board's rule for steppers is that only the user runs them, with their own sign-in. Agents,
integrations and the page never see the token (note 2.1). Without the reserved prefix, any page
script could read the token with `secret_get("action__github__<login>")`, and the engine could
read it as a workspace secret. The only way to these names is now the `halonic-action-send`
crate, which the shell's `action_*` commands wrap.

## Covers

- studio.src-tauri.crates.secrets.secret-commands
- apps/studio/src-tauri/crates/secrets/tests/commands.rs
