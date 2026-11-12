# halonic-git-guard

Runs git for the Studio shell: an allow-list of calls, hardened every time, and only in folders the user opened (HAL-192, closing HAL-6 finding 7). Plain Rust with no Tauri types and no dependencies; the shell's `git` command wraps `GitRunner::run`.

- `check_args`: each allowed subcommand has its own list of options, matched exactly, with a rule for each value. The list is in `src/allow_list.rs`.
- `GitRunner`: checks that every folder of the repository is inside an opened folder, neutralises what the repository's own config names (filters, merge drivers, ssh, signing and credential programs), then runs git with a clean `GIT_*` environment, its config given in the environment, hooks pointed at an empty folder and only the `https` and `ssh` transports. It needs git 2.31 or later. When it starts, it asks the git it found once, hardened, for `core.hooksPath` inside the empty hooks folder; a program that doesn't answer with that folder, such as a wrapper script that drops the `GIT_CONFIG_*` variables, is refused with `hardening_ignored`, so no call runs without the hardening. `docs/config-keys.md` lists every git config key that runs a program or reads a file, and how the runner handles each.
- `OpenedFolders`: the folders git may run in. It starts empty; the folder picker (HAL-191) adds to it, and revoking a folder's trust takes it off again with `close` (HAL-2612). `list` gives the open folders in the order they were opened; the shell passes them to the agent host as sweep roots (HAL-6256).
- `find_git` and the limited run: git found on an absolute PATH folder, run without a shell in a process group of its own, and stopped with every program it started when it passes its deadline or output limit.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, for example `git_allow_list_` for `git-allow-list`.
