# Decision: test the agent sandbox's elevated helper on the Windows runner

- Task: HAL-1451 (S1: set up the agent sandbox from the installed app; Julian's design on HAL-1415)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-1451](/HAL/issues/HAL-1451)
- Kind: internal

## What changes

The `tauri-windows` job in `.github/workflows/ci.yml` gets one step after the Rust tests. It builds `halonic-sandbox-elevate` with the static C runtime, as the release will, puts it in a temporary folder with srt-win.exe, and runs it on the runner:

- `dumpbin /imports` lists the helper's imports and compares them with the runner's KnownDLLs. Every import that isn't a KnownDLL, an api set or ntdll, plus `vcruntime140`, `version`, `profapi`, `cryptbase` and `wldp`, is planted next to it as a real library (built in the step with `rustc`) that writes a marker when loaded. Every run below must leave no marker (Julian's S-2 on HAL-7385);

- an option after the verb is refused (exit 30);
- `setup` passes, makes an admin-only `tmp` folder for srt-win's temporary files (S-1), makes the `srt-sandbox` account and the **Halonic agent sandbox** Installed apps entry, and leaves `Program Files\Halonic Sandbox` owned by Administrators, with no inherited rules and nobody else allowed to write;
- `setup` again passes (Repair);
- a swapped srt-win.exe is refused (exit 33) and its copy deleted;
- `remove`, started from the folder's copy as Installed apps starts it, passes and takes the entry and the account away.

Same triggers, same read-only rights, no secrets, publishes nothing. The runner's user is an administrator with UAC off, so there's no prompt.

## Why

The helper's Windows calls (folder owner and access list, `HKLM`, the elevation check, the static runtime and the manifest) can only be proven on Windows. The crate's own tests cover its steps against a pretend Windows; this step proves the real one.

## Also in this pull request

The new crate turns the workspace's `unsafe_code = "forbid"` off in its own `Cargo.toml`, as `process-probe` does (HAL-2719). Its README says why; Liam approves that exception in the same review.

## Covers

- .github/
