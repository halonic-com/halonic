# halonic-owner-sign-in

Signs the desktop shell in to an owner's own server (`mode: owner`) with the server's password, and out again (HAL-18944, the decision recorded on HAL-13265). Plain Rust with no Tauri types that makes no calls itself; the shell's `owner_login`, `owner_logout` and `owner_status` commands (`src/owner_sign_in.rs`) make the calls.

- `owner_origin` and `owner_address`: `https://` only, refused before any lookup; then the connect check pins the addresses every call goes to.
- `check_owner_hello`: the hello answer must be Halonic, `mode: owner` (a many-user server is refused), with a `minStudioVersion` no newer than this Studio and a `version` no older than the shell's `OLDEST_SERVER`.
- `sign_in`: the hello check first, the password only after it passes and only to `POST /api/login`, then the `__Host-halonic-session` cookie and the time into the keychain. The password is never stored.
- `sign_out`: removes the local entry first, then asks the server; succeeds when the server can't be reached.
- `OwnerAnswer`: all the page learns, `signedIn`, `notSignedIn` or an error code.
- `DeploymentRoute`, `session_for` and `not_redirected` (HAL-20105): what the shell's `deployment_request` and `deployment_stream` commands (`src/deployment_calls.rs`) may call once signed in. Three read routes by name, a run id checked with `halonic-run-store`'s rule and refused rather than encoded, the session only for the exact origin it was kept for, and no redirect. Requirement `deployment-call-commands`, whose tests start with `deployment_call_commands_`.

The session's keychain entry is `owner_session__` and 32 hex digits of the origin's SHA-256, one per origin. `halonic-secrets` reserves the prefix, so `secret_get`, `token_get`, the engine and the agent host can't reach it (RO-15).

The requirement is `apps/studio/src-tauri/requirements/owner-sign-in-commands.md`, a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `owner_sign_in_commands_`.
