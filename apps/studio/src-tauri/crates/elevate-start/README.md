# halonic-elevate-start

Starts Halonic's sandbox helper (`halonic-sandbox-elevate.exe`) with Windows' administrator prompt, for Studio's Settings › Agent sandbox and the Inbox setup card (HAL-14841). The shell's `sandbox_elevate` command uses it; the installer does the same in NSIS (HAL-14812).

- **The start:** `ShellExecuteExW` with the `runas` verb, `SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC`, Studio's window as the owner so the prompt comes to the front, the helper's folder as the working folder, and no window of its own. The helper takes one argument, `setup` or `remove`.
- **The answer:** the helper's exit code; `Cancelled` for `ERROR_CANCELLED` (the prompt was turned down or closed); `TimedOut` when it still runs at the limit; `Failed` with Windows' reason when it didn't start.
- **One at a time:** while a start runs, or while a helper left running at its limit still runs, a new start answers `StillRunning` and Windows isn't asked again. A helper still running at the limit is never stopped: it runs as an administrator, and stopping it halfway would leave the machine half set up.

The rules are in `src/lib.rs`, written against the `Launch` trait, and `src/tests.rs` runs them anywhere. The Windows calls are in `src/windows.rs`; its own tests start real programs with `runas`, so they are ignored in plain `cargo test`. The `tauri-windows` CI job runs them, where the runner's user is an administrator with UAC off and Windows asks nothing.

## Why this crate allows `unsafe`

The standard library can't start a program with the `runas` verb or wait on its process handle with a limit, and the workspace forbids `unsafe` code. As in `process-probe` (HAL-2719) and `sandbox-elevate`, this crate turns the lint off in its own `Cargo.toml`; every `unsafe` block has a `// SAFETY:` comment (`undocumented_unsafe_blocks` is denied), and the only handle it holds stays inside the `windows` module. `windows-sys` is pinned to the version already in `Cargo.lock`, with only the features it calls turned on, so the crate adds no new code to the build.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves: `elevate_start_`.
