# halonic-process-probe

Asks the operating system whether a process still runs (`process_alive`) and what this computer is called (`host_name`), with the same calls libuv, and so Node, makes (HAL-2701), apart from one Windows difference described below. The shell's run lock needs both to tell a crashed writer's lock from a live one, and must judge a lock exactly as the CLI's `fs-node` lock does.

- **Unix and Android:** `kill(pid, 0)`, where `EPERM` (a process of another user) counts as running, and `gethostname`.
- **Windows:** `OpenProcess`, then `GetExitCodeProcess` and `STILL_ACTIVE`, because a process that has exited can still be opened while a handle to it is held. Access denied counts as running, as `EPERM` does in Node. The crate opens the process with `PROCESS_QUERY_LIMITED_INFORMATION`, not libuv's `PROCESS_TERMINATE | PROCESS_QUERY_INFORMATION | SYNCHRONIZE`, so in one case the answers differ: another user's process that has exited while a handle to it is still held. Node says running, the crate says not running, which is correct. The host name comes from `GetHostNameW`, the DNS name, as in libuv.
- **Ids Node refuses** (0, or above `i32::MAX`) never name a running process.
- **No host name** (the call failed, or the name isn't valid Unicode) is `None`. The run lock then treats every lock as another computer's and judges it by age only, which is the safe direction.

## Why this crate allows `unsafe`

The standard library can't ask either question, and the workspace forbids `unsafe` code. Liam approved one exception on HAL-2719: this crate, and only this crate, turns the lint off in its own `Cargo.toml`. Each `unsafe` block has a `// SAFETY:` comment (Clippy's `undocumented_unsafe_blocks` is denied here), and the API is two safe functions: no handle or pointer leaves the crate.

`libc` (Unix) and `windows-sys` (Windows) are pinned to the versions already in `Cargo.lock`, so the crate adds no new code to the build. Only the `windows-sys` features it calls are turned on.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `process_probe_` for `process-probe`.
