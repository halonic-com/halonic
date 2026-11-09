# halonic-git-guard

Runs git for the Studio shell (HAL-192, closing HAL-6 finding 7). Plain Rust with no Tauri types and no dependencies; the shell's `git` command wraps it.

- `check_args`: each allowed subcommand has its own list of options, matched exactly, with a rule for each value. The list is in `src/allow_list.rs`.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `git_allow_list_` for `git-allow-list`.
