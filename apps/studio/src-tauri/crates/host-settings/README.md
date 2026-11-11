# halonic-host-settings

The settings kept where Halonic runs (HAL-6261): the assistant and the sandbox default, for every workspace on this computer. `FileHostSettingsStore` keeps them exactly as `FileHostSettingsStore` in `packages/adapters/fs-node` does, so the desktop app and the CLI share one file, `<profile>/settings/host.json`. Plain Rust with no Tauri types; the shell's `host_settings_*` commands wrap it.

- `read`, `set` and `remove` keep the `HostSettingsStore` port: values by key, a save changes one key and keeps every other key and field, also the ones a newer Halonic wrote. `is_host_setting_key`, `read_saved_host_settings` and `change_saved_host_settings` are ports of the TypeScript functions of the same names in `@halonicjs/ports`.
- A file that can't be parsed reads as none saved, and the first save over it keeps it as `host.json.broken`.
- A `host.json` that is a link, a hard link or not a plain file can't be read, so `read` fails as `Unreadable`; a save renames a new file over it. Rust's standard library has no `O_NOFOLLOW`, so on Unix the open file must be the one looked at (same device and inode). On Windows a hard link can't be told yet.
- Writes go through a temporary file and a rename. The folder gets mode `700` and the file `600`.
- The store doesn't take turns: the shell holds one lock around every save, so two windows that save two keys at once keep both.
- `serde_json` sorts the fields when it writes the file. The settings are the same; only the order differs from what `fs-node` writes.

`tests/golden.rs` checks the port's golden cases, `packages/core/ports/src/golden/host-settings-limits.json`: the keys allowed and refused, the sizes at the limit and the saved texts, the same file the TypeScript contract suite reads. `tests/files.rs` checks the file rules. The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `host_settings_file_`.
