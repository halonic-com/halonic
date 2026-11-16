# Decision: CI tests the resource-probe crate on macOS

- Task: HAL-11118 (part 2, the `resource_report` command)
- Approval: Liam asked for this step in his review of PR 3184 on HAL-11131; Liam signs this note as the CTO
- Kind: internal
- Signature: (Liam adds the line from `pnpm decision sign 3184`)

## What changes

In `.github/workflows/ci.yml`, the `tauri-keychain-macos` job gets one new step, "Resource probe (task_info)". It runs `cargo test --locked -p halonic-resource-probe`.

## Why

The new `resource-probe` crate calls macOS `task_info` in `unsafe` code. The other Rust jobs run on Linux and Windows, so nothing built or tested that code. The macOS job already exists, so the step runs there.

No check is removed or weakened: this adds a test run and changes no other step, trigger, permission or secret.

## Covers

- .github/
