# halonic-keep-awake

"Keep this computer awake while it's plugged in" (phase 2 G5, HAL-17641; section 2.4 of the HAL-17511 architecture note). Plain Rust with no Tauri types.

- `KeepAwake` holds a `SleepLock` exactly while the setting and remote are on and a `PowerSource` says mains. Both switches start off. The tests drive it with a fake power source and a fake lock.
- `SystemPower` reads `/sys/class/power_supply` on Linux, `pmset -g ps` on macOS and `GetSystemPowerStatus` on Windows. A computer with no battery counts as mains.
- `SystemSleepLock` stops sleep only, never the screen lock: `systemd-inhibit --what=sleep:idle` around `cat` on Linux (it ends when Halonic's end of the pipe closes), `caffeinate -i -w <Halonic's pid>` on macOS, and `SetThreadExecutionState` from its own thread on Windows. So the lock ends with Halonic even after a crash. No new third-party code: Windows uses the `windows-sys` already in `Cargo.lock`.

Not here: the shell's `keep_awake_set` command and its once-a-minute power check (`src/keep_awake.rs`), and the Settings › Remote switch.

The requirement in `requirements/` is a draft until the trace check reads `cargo test` results. Until then, each test's name starts with `keep_awake_`.
