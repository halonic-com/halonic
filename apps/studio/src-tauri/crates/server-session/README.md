# halonic-server-session

The shell's half of "Run with Claude" on the user's own server (HAL-17843, plan on HAL-17834 sections 2 to 4). It checks the server from the profile's settings and the task id against the cases `packages/core/action-steppers` shares with it, checks the brief's shape, writes the brief and a launcher that holds no path into a private folder, and builds the command that opens the launcher in a terminal. Plain Rust with no Tauri types; the shell's `server_session_open` command wraps it.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Each test's name starts with the last part of the requirement it proves.
