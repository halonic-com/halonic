# halonic-sandbox-elevate

The one program that runs with administrator rights when the agent sandbox is set up or removed on Windows (HAL-1451, from Julian's design on HAL-1415). Studio's **Set up the sandbox**, `halonic sandbox setup` and the installer's sandbox step all start it, so there is one UAC prompt, with Halonic as the publisher once the release signs it.

```
halonic-sandbox-elevate.exe setup
halonic-sandbox-elevate.exe remove
```

## What it does

- **Nothing but the verb.** It reads one argument, `setup` or `remove`, and no options. srt-win's options change what the fence is (`--allow-loopback`, `--proxy-port-range`, `--force` and so on), so none of them can be passed in: the helper always runs plain `srt-win.exe install` or `uninstall`. It never passes `--force`, so a sandbox another program set up with other settings is reported (srt-win's exit 13), not replaced.
- **Only an admin-only copy runs.** It makes `%ProgramFiles%\Halonic Sandbox\` (owner Administrators; Administrators and SYSTEM full control, Users read and run; nothing inherited), copies `srt-win.exe` from next to itself into it, and checks the **copy's** SHA-256 against `SRT_WIN_SHA256`. A copy that doesn't match is deleted and nothing runs. srt-win then runs from that folder, started in System32. None of the user's environment reaches it: an elevated process inherits the user's variables, which any of their programs can change, so srt-win gets only `SystemRoot`, `windir`, `SystemDrive`, `ProgramData`, `ProgramFiles`, `PUBLIC`, `LOCALAPPDATA`, `ComSpec`, `PATHEXT`, a System32-only `PATH`, and `TEMP`/`TMP` in an admin-only `tmp` folder inside `Halonic Sandbox\`, all from Windows' own calls (`environment()`). srt-win needs `PUBLIC` for one of the folders it denies the sandbox writes in, and `LOCALAPPDATA` for its state database, which every later sandboxed run reads from the same place; without it, `install` fails with 17.
- **Its own libraries come from System32.** The executable is linked with `/DEPENDENTLOADFLAG:0x800`, and the release builds it with the static C runtime, so a `vcruntime140.dll` dropped next to it in the user's app folder is never loaded. That flag covers only the import table, so the first thing `main` does is `SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32)`: libraries Windows loads later on the helper's behalf, such as `profapi.dll` behind `SHGetKnownFolderPath`, come from System32 too. The CI step proves it: it plants a real library, under the name of every import that isn't one of Windows' KnownDLLs and of the ones Windows looks for itself, and fails if any of them loads.
- **It asks for administrator rights itself.** Its manifest says `requireAdministrator`. Started without them anyway, it stops with exit 31 rather than let srt-win show a second prompt.
- **Installed apps.** After a setup that passes, it copies itself into the folder and adds **Halonic agent sandbox** to Windows Settings › Installed apps. Uninstalling it there runs that copy's `remove`, so the sandbox can be removed however Halonic was installed, and after Halonic is gone. `remove` takes the entry, the copies and the folder away once srt-win's uninstall passes (its own copy at the next restart, because it is running).

## Exit codes

srt-win's pass through unchanged: 0 done, 1 other, 10 cancelled, 12 network filters, 13 set up with other settings, 14 account, 17 write denies. The helper's own:

| Code | Meaning |
| --- | --- |
| 30 | Not exactly one argument, or not `setup` or `remove` (and every run on a computer that isn't Windows) |
| 31 | Started without administrator rights |
| 32 | No `srt-win.exe` next to the helper |
| 33 | The copy's SHA-256 isn't the one built in |
| 34 | The admin-only folder couldn't be made, secured or filled |
| 35 | The Installed apps entry couldn't be written or deleted |
| 36 | srt-win couldn't be started, or the helper couldn't limit its libraries to System32 |

The caller turns these into the outcome and the reason sentence; the helper writes no result file, because the user's side would have to trust it.

## Updating sandbox-runtime

`SRT_WIN_SHA256` is the hash of the `srt-win.exe` the pinned sandbox-runtime ships. `tests/srt_win_hash.rs` reads the installed package and fails when they differ, so a sandbox-runtime update changes the constant in the same pull request.

## Why this crate allows `unsafe`

The standard library can't ask whether the process is elevated, find Program Files without the environment, set a folder's owner and access list, or write `HKLM`. As in `process-probe` (HAL-2719), this crate turns the workspace's `unsafe_code = "forbid"` off in its own `Cargo.toml`; every block has a `// SAFETY:` comment, and nothing unsafe leaves `src/windows.rs`. The steps themselves are in `src/lib.rs`, written against a `Machine` trait, and `tests/steps.rs` runs them anywhere against a pretend Windows. The `tauri-windows` CI job runs the real thing on the runner.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with `sandbox_elevate_`.
