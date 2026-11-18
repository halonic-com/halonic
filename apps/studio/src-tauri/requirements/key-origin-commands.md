# studio.src-tauri.key-origin-commands

- Status: draft
- Since: unreleased
- Source: HAL-11887; `studio.src-tauri.crates.secrets.key-origins`; `originOfAddress` and `AddOriginResult` in `@halonicjs/adapter-secrets-file` (HAL-11871)

When the page calls `secret_allow_origin` with a key's name and an address, the shell shall make the address' origin itself, as `new URL(…).origin` writes it (scheme, host in Punycode and port, the default port left out, no path), and add that origin to the key's list as `allow_origin` does, so the page can store nothing but an origin. It shall answer in the shape of `AddOriginResult`: `{ result: "added" | "already-allowed", origin }`, `{ result: "no-key" | "full" }`, or `{ result: "bad-address", problem }`, where `problem` is `not-an-address` for an address that doesn't parse or isn't `http` or `https`, and `has-user-info` for one that holds a user name or a password, writing nothing then. When the page calls `secret_allowed_origins` with a key's name, the shell shall return the key's origins, or `null` when none is recorded, and shall refuse with `backend` a list holding anything that isn't already an origin in that form. The shell shall run every `secret_set`, `secret_delete` and `secret_allow_origin` one after another, so two calls never lose an origin and a deleted key never leaves a list behind. Both commands shall be granted to the app's own local main window on desktop only, never to the Studio the computer serves.

## Examples

- Given the address `https://LLM.Example.com:443/v1/chat`,
  when the page allows it for `acme-key`,
  then the shell stores and answers the origin `https://llm.example.com`.
- Given the address `https://bücher.example/v1`,
  when the page allows it,
  then the origin is `https://xn--bcher-kva.example`, as in Node.
- Given `ftp://llm.example.com` or `llm.example.com`,
  when the page allows it,
  then the answer is `bad-address` with `not-an-address`, and nothing is written.
- Given `https://user:pw@llm.example.com`,
  when the page allows it,
  then the answer is `bad-address` with `has-user-info`.
- Given a request from the computer's served Studio,
  when it calls `secret_allowed_origins` or `secret_allow_origin`,
  then the shell refuses it like every other command.
