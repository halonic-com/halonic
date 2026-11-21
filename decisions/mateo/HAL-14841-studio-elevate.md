# Decision: Studio asks for the sandbox's administrator rights from its own window, with a 5-minute limit

- Approval: HAL-14841 (Liam's decisions of 21 Nov)
- Kind: user-visible

On a tester's PC the 21 Nov preview asked for the sandbox's administrator rights from a hidden, non-interactive PowerShell under the agent host (`Start-Process -Verb RunAs -WindowStyle Hidden`), and no prompt and no `consent.exe` ever showed: the setup waited for ever (HAL-14812). The installer was fixed in #4275. This does the same for Studio.

The shell gets one new command, `sandbox_elevate`, granted only to the app's local main window on Windows. It takes only a verb, `setup` or `remove`, and starts the signed `halonic-sandbox-elevate.exe` beside the app with `ShellExecuteExW("runas")`, owned by Studio's window, so the prompt comes to the front. The new crate `halonic-elevate-start` holds the Windows calls; it allows `unsafe` in its own `Cargo.toml`, as `process-probe` and `sandbox-elevate` do.

**What changes from HAL-1415 (point 2.5, "no time limit"), for Studio only:** the shell waits at most 5 minutes, as the installer does. HAL-1415 left the wait open because a prompt approved late still runs the setup, and stopping early would hide its result. That still holds, so a helper still running at the limit is never stopped (it runs as an administrator, and stopping it halfway would leave the machine half set up): Studio says Windows didn't finish, and a new press while that helper still runs says so instead of asking Windows again. An open wait is what left the tester's setup hanging with nothing to do. The exit code never counts as "set up" on its own: Studio still asks the agent host for its unelevated check afterwards. `halonic sandbox setup` keeps the PowerShell path and its open wait, since it runs in a visible terminal where Ctrl+C works.

The CI change adds one step to the `tauri-windows` job that runs the crate's real-Windows tests (`cargo test -p halonic-elevate-start -- --ignored`). Nothing is skipped or weakened.

## Covers

- .github/
