# halonic-login-item

Halonic's "Start Halonic when I log in" entry (B1 step 6, HAL-14221; decision D9 of the HAL-14206 design note, with the HAL-14212 security review's changes). Plain Rust with no Tauri types.

- `LoginItem::for_this_halonic()` is the running executable's entry at this user's usual place: the `Run` value `Halonic` under `HKCU` on Windows, `~/Library/LaunchAgents/com.halonic.studio.plist` on macOS, `$XDG_CONFIG_HOME/autostart/halonic.desktop` on Linux. `LoginItem::at` takes another place, which is how the tests avoid the real one.
- `turn_on(installed)` writes the entry with exactly `--background` and the path quoted for that system; `is_installed()` says whether Halonic runs from where it was installed (`installed.rs`), and `turn_on` writes nothing when it doesn't. `turn_off()` removes it and never checks where Halonic runs from. `is_on()` says whether it is there.
- Errors never hold a path.

Why not `tauri-plugin-autostart`: its `auto-launch` writes the path unquoted on Windows and Linux, and tries the machine-wide `HKLM` `Run` key first on Windows. This crate writes the per-user entry only and adds no third-party code: on Windows it calls the registry through the `windows-sys` already in `Cargo.lock`.

Not here: the shell's `login_item_get` / `login_item_set` commands (`src/login_item.rs`), the Settings › Startup switch, what `--background` does at start, and the uninstaller removing the `Run` value (`windows/installer.nsi`).

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with the last part of the requirement it proves, `login_item_`.
