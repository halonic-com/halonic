# halonic-command-paths

Finds the absolute path of a connector's program, by the rules of `findCommand` in `apps/cli/src/command-paths.ts` (HAL-7876). The trust check fingerprints that path with the command, so the Studio and the CLI must find the same one. Plain Rust with no Tauri types and no dependencies; the shell's `command_paths` command wraps `find_commands`.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Each test's name starts with the last part of the requirement it proves.
