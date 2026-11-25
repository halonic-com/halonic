# studio.src-tauri.crates.secrets.owner-sessions

- Status: draft
- Since: unreleased
- Source: HAL-18944 (RO-15); the decision recorded on HAL-13265

When the shell keeps the session of an owner server it signed in to, it shall store it under `owner_session__` followed by exactly 32 lower-case hex digits, built only by `SecretName::owner_session`, which refuses any other key with `invalid_name`. The prefix `owner_session__` shall be a part of Halonic's reserved names: `secret_get`, `secret_has`, `secret_set`, `secret_delete`, `token_get`, `token_set`, `token_delete`, the engine's secret broker and the agent host's secrets channel shall refuse every spelling of it (`owner-session__…`, upper case) with `reserved_name`, and the backend shall not run, so no page, engine or agent reads, changes or removes a session.

## Examples

- Given a session the shell stored under `owner_session__0123456789abcdef0123456789abcdef`,
  when the page calls `secret_get` or `token_get` with that name, `owner-session__…` or `OWNER_SESSION__…`,
  then the call is refused with `reserved_name` and the session stays stored.
- Given the key `0123456789ABCDEF0123456789ABCDEF` or one of 31 digits,
  when the shell builds a session name from it,
  then it is refused with `invalid_name`.
