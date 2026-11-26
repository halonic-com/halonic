# halonic-owner-sign-in

Signs the desktop shell in to an owner's own server (`mode: owner`) with the server's password, and out again (HAL-18944; the hello-mode decision is `decisions/elena/HAL-13265-hello-mode.md`). Plain Rust with no Tauri types that makes no calls itself; the shell's `owner_login`, `owner_logout` and `owner_status` commands (`src/owner_sign_in.rs`) make the calls.

- `owner_origin` and `owner_address`: `https://` only, refused before any lookup; then the connect check pins the addresses every call goes to.
- `check_owner_hello`: the hello answer must be Halonic, `mode: owner` (a many-user server is refused), with a `minStudioVersion` no newer than this Studio and a `version` no older than the shell's `OLDEST_SERVER` (the oldest server version it signs in to, a constant in `src/owner_sign_in.rs`, now `0.1.0`).
- `sign_in`: the hello check first, the password only after it passes and only to `POST /api/login`, then the `__Host-halonic-session` cookie and the time into the keychain. The password is never stored.
- `sign_out`: removes the local entry first, then asks the server; succeeds when the server can't be reached.
- `OwnerAnswer`: all the page learns, `signedIn`, `notSignedIn` or an error code.

The session's keychain entry is `owner_session__` and 32 hex digits of the origin's SHA-256, one per origin. `halonic-secrets` reserves the prefix, so `secret_get`, `token_get`, the engine and the agent host can't reach it (draft requirement `owner-sessions` in `halonic-secrets`, labelled RO-15 in its source line).

The requirement is `apps/studio/src-tauri/requirements/owner-sign-in-commands.md`, a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `owner_sign_in_commands_`.
