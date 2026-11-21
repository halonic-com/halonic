# Decision: the Rust CI job runs the phone against the real remote gateway

- Task: HAL-12244
- Approval: Liam approves and signs this note in review, on the pull request's security review task
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QHIxeJ8FE7R48tHrRYeUTWYoCCP6GtcrUv+/ThPDEr50e4tHzAcsalzstewUs8r1yOx/DyDrYtixzOrvW+8sBQ==

## What changes

In `.github/workflows/ci.yml`, the `tauri` job ("Tauri shell (Rust checks)"):

- gets a step after its tests, "Phone against the remote gateway", that runs
  `cargo test --locked -p halonic-tunnel --test gateway -- --ignored` with a 5-minute limit. The test starts the
  host's gateway in Node with `pnpm exec node`, which the job's existing setup step already installed;
- runs also when `packages/adapters/remote-gateway/src/` or `packages/core/ports/src/remote-gateway-*` changes, so a
  change on the host's side runs the interop test too.

Triggers, rights, runners, secrets and every other job don't change.

## Why

The phone's end of the tunnel (Rust) and the host's gateway (TypeScript) were each tested only against a stand-in
of the other. This test runs the two real implementations against each other (requirement
`studio.src-tauri.crates.tunnel.gateway-interop`). Plain `cargo test` ignores it because it needs pnpm and the
workspace's packages, so CI has to run it by name.

## Tests

No test was weakened or skipped. The new step adds five tests.

## Covers

- .github/
