# halonic-sandbox-elevate

The one program that runs with administrator rights when the agent sandbox is set up or removed on Windows (HAL-1451, from Julian's design on HAL-1415). Studio's **Set up the sandbox**, `halonic sandbox setup` and the installer's sandbox step all start it, so there is one UAC prompt, with Halonic as the publisher once the release signs it.

```
halonic-sandbox-elevate.exe setup
halonic-sandbox-elevate.exe remove
```

## What it does

- **Nothing but the verb.** It reads one argument, `setup` or `remove`, and no options. srt-win's options change what the fence is (`--allow-loopback`, `--proxy-port-range`, `--force` and so on), so none of them can be passed in: the helper always runs plain `srt-win.exe install`, or `uninstall --elevated-step`. It never passes `--force`, so a sandbox another program set up with other settings is reported (srt-win's exit 13), not replaced.
- **Only an admin-only copy runs.** It makes `%ProgramFiles%\Halonic Sandbox\` (owner Administrators; Administrators and SYSTEM full control, Users read and run; nothing inherited), reads `srt-win.exe` from next to itself into memory and checks its SHA-256 against `SRT_WIN_SHA256` there. Only bytes that match are written into the folder, so nothing else the app folder's name reached, such as a link to an admin-only file, ever lands where Users can read it (HAL-7386). When they don't match, nothing is written, an earlier copy is deleted and nothing runs. srt-win then runs from that folder, started in System32. None of the user's environment reaches it: an elevated process inherits the user's variables, which any of their programs can change, so srt-win gets only `SystemRoot`, `windir`, `SystemDrive`, `ProgramData`, `ProgramFiles`, `PUBLIC`, `LOCALAPPDATA`, `ComSpec`, `PATHEXT`, a System32-only `PATH`, and `TEMP`/`TMP` in an admin-only `tmp` folder inside `Halonic Sandbox\`, all from Windows' own calls (`environment()`). srt-win needs `PUBLIC` for one of the folders it denies the sandbox writes in, and `LOCALAPPDATA` for the lock it takes while it does; without it, `install` fails with 17. `LOCALAPPDATA` is the admin-only `tmp` folder too, not the user's own: srt-win keeps the user's session store there (`sandbox-runtime\state.db` and its lock file) and opens it by name, and any of the user's programs can change that folder. Neither step the helper runs reads that store, so with administrator rights srt-win opens nothing in a folder the user can change.
- **Its own libraries come from System32.** The executable is linked with `/DEPENDENTLOADFLAG:0x800`, and the release builds it with the static C runtime, so a `vcruntime140.dll` dropped next to it in the user's app folder is never loaded. That flag covers only the import table, so the first thing `main` does is `SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32)`: libraries Windows loads later on the helper's behalf, such as `profapi.dll` behind `SHGetKnownFolderPath`, come from System32 too. The CI step proves it: it plants a real library, under the name of every import that isn't one of Windows' KnownDLLs and of the ones Windows looks for itself, and fails if any of them loads.
- **srt-win gets a pinned C++ runtime beside it (S-9).** srt-win imports `vcruntime140.dll`, which a clean Windows 11 doesn't have. The installer ships Microsoft's copy (version and hash pinned in `windows/vcruntime.json`, fetched by `windows/fetch-vcruntime.ps1`) next to the helper as `vcruntime140.dll.pinned`, a name nothing loads. `setup` checks its SHA-256 against the one built in, in memory, and writes it as `vcruntime140.dll` into `Halonic Sandbox\` beside srt-win, which Windows then loads from srt-win's own folder. It is never written into the user's app folder. A missing or changed file stops `setup` with exit 39 (missing) or 40 (changed), codes of their own so they aren't mistaken for srt-win's 32 and 33. `remove` deletes it, and still works for a sandbox set up before it was shipped.
- **It asks for administrator rights itself.** Its manifest says `requireAdministrator`. Started without them anyway, it stops with exit 31 rather than let srt-win show a second prompt.
- **One folder, whatever its name.** Whether the helper runs from `Halonic Sandbox\` is decided by the folder's identity (volume and file index), not by comparing names, which Windows writes in many ways (letter case, 8.3 short names, `\\?\`). It never copies a file onto itself: that would delete the protected srt-win copy (Julian's S-5 on HAL-7385).
- **Its own copy shows its publisher.** A release build has the publisher it's signed by built in (`HALONIC_SANDBOX_SIGNER`, set when the release builds it, HAL-1197). It writes the copy of itself into the folder as a file only Administrators and SYSTEM can open. Before setup runs srt-win, that copy must pass `WinVerifyTrust` with that same publisher, the name the UAC prompt showed. While the helper runs, its file in the app folder can be renamed and another put in its place, so the copy could be someone else's program. Only a copy that passes is opened to Users. Otherwise the copy is deleted, nothing runs, no entry is written and the helper exits 35 (S-4). The publisher is built in rather than read from the helper's own file, because that file is the one that may have been swapped. Dev and CI builds aren't signed and skip the check. `remove` doesn't check again: from Installed apps, the copy is the program running.
- **Only the machine-wide half of a removal.** `remove` runs `srt-win uninstall --elevated-step`: the network filters, the write denies on system folders, the sandbox account, its group and the `HKLM` record. srt-win's own unelevated `uninstall` splits it the same way. The other half, taking back the grants srt-win kept for the user (`srt-win profile forget` and `srt-win acl forget --all`), changes access lists on the paths in the user's session store, so it runs without administrator rights, in Halonic's own removal right after the helper (`sandbox-srt`'s `uninstallWindowsSandbox`). Removing the sandbox from Installed apps runs the helper only, so those grants stay recorded; they name a group that no longer exists, and Halonic's removal takes them back when it runs.
- **Installed apps.** Before srt-win runs, it copies itself into the folder (above); after a setup that passes, it adds **Halonic agent sandbox** to Windows Settings › Installed apps. Uninstalling it there runs that copy's `remove`, so the sandbox can be removed however Halonic was installed, and after Halonic is gone. `remove` takes the entry, the copies and the folder away once srt-win's uninstall passes (its own copy at the next restart, because it is running).

## Exit codes

srt-win's pass through unchanged: 0 done, 1 other, 10 cancelled, 12 network filters, 13 set up with other settings, 14 account, 17 write denies. The helper's own:

| Code | Meaning |
| --- | --- |
| 30 | Not exactly one argument, or not `setup` or `remove` (and every run on a computer that isn't Windows) |
| 31 | Started without administrator rights |
| 32 | No `srt-win.exe` next to the helper |
| 33 | srt-win's SHA-256 isn't the one built in |
| 34 | The admin-only folder couldn't be made, secured or filled |
| 35 | The Installed apps entry couldn't be written or deleted, or the helper's copy for it doesn't show the release's publisher (the copy is deleted) |
| 36 | srt-win couldn't be started, or the helper couldn't limit its libraries to System32 |
| 39 | No `vcruntime140.dll.pinned` next to the helper |
| 40 | The runtime's SHA-256 isn't the one built in (the copy is deleted) |

The caller turns these into the outcome and the reason sentence; the helper writes no result file, because the user's side would have to trust it.

## Updating sandbox-runtime

`SRT_WIN_SHA256` is the hash of the `srt-win.exe` the pinned sandbox-runtime ships. `tests/srt_win_hash.rs` reads the installed package and fails when they differ, so a sandbox-runtime update changes the constant in the same pull request.

## Why this crate allows `unsafe`

The standard library can't ask whether the process is elevated, find Program Files without the environment, set a folder's owner and access list, or write `HKLM`. As in `process-probe` (HAL-2719), this crate turns the workspace's `unsafe_code = "forbid"` off in its own `Cargo.toml`; every block has a `// SAFETY:` comment, and nothing unsafe leaves the `windows` module (`src/windows.rs` and `src/windows/`). The steps themselves are in `src/lib.rs`, written against a `Machine` trait, and `tests/steps.rs` runs them anywhere against a pretend Windows. The `tauri-windows` CI job runs the real thing on the runner.

The requirements in `requirements/` are drafts until the trace check reads `cargo test` results. Until then, each test's name starts with `sandbox_elevate_`.
