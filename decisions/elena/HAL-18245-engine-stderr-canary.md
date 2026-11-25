# Decision: CI runs the engine stderr canary test

- Approval: Liam reviews this on HAL-18245 (from the B1 security review, HAL-14212)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wrhG0e0skHp8FM847SubmCtiFQE73v7X4pbBTava4gELE5yzcoTW7yQArokKtQotjjJywhrtc9xCDiMRQe3FCQ==

The Linux Rust job in `.github/workflows/ci.yml` (`Tauri shell (Rust checks)`) gets one step,
`cargo test --locked -p halonic-engine-supervisor --test engine_stderr -- --ignored`, right after the gateway test's
step and like it: the test starts the real engine role in Node through pnpm, which plain `cargo test` doesn't have, so
it is ignored there. It checks that a secret the broker hands the engine, printed on the engine's stderr, never reaches
`shell.log`. It is the only change under `.github/`: no new permission, secret, action or trigger.

## Covers

- .github/
