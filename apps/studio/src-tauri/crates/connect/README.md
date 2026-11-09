# halonic-connect

Checks the address the Android app connects to and reads the computer's hello answer (flow-install-update 5.3 and 5.4). Plain Rust with no Tauri types; the shell's `connect` command wraps it.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `connect_check_` for `connect-check`.
