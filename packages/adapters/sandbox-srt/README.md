# @halonicjs/adapter-sandbox-srt

The `Sandbox` port on [sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (srt): bubblewrap on Linux, Seatbelt on macOS, and on Windows a sandbox user account with network filters (srt's alpha Windows mode, only when its install is there; WSL2 also works).

- **Layer:** adapters
- **Owner:** mateo
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sandbox-srt`

`SrtSandbox` is the whole adapter. `check()` says whether the sandbox can start on this machine and
gives the first reason when it can't: Windows without srt's install (`srt windows-install`, once, as an administrator), inside a container (Docker or Podman), user
namespaces refused, bubblewrap missing, or `socat` or ripgrep (`rg`) missing, which srt starts next to bubblewrap
(`linux-tools-missing`). `open()` checks first, refuses a bridge that isn't a
loopback address, then opens a session that proves its fence (a canary file the fence hides and a
loopback port it blocks) before any program starts. Programs never start without a proven fence, and
never run a file under a skill's `scripts/` folder. When a session ends, it undoes any `commondir`
file the program changed in the working folder's git folders and moves aside any `.git` the program
planted at a gitlink, reporting each as a refused write.

On Windows there is no `env`, `sh` or process group: the launcher builds one `cmd.exe` command line
(the program's variables set first), and `killTree` is `taskkill /T /F`, with no grace period. A
program, argument or variable with a double quote, a percent sign, a line break or a NUL is refused
rather than quoted wrongly. The fence probe is therefore a script file in the session's temp folder,
not `node -e`. The launcher itself, which runs outside the fence, gets only the system and
user-folder variables `cmd.exe` and srt need (`SystemRoot`, `ComSpec`, `PATHEXT`, `USERPROFILE`,
`APPDATA` and the like, read in any letter case), the safe host `PATH`, and the session's temp
folder as `TEMP`, `TMP` and `TMPDIR`. The program gets the profile's variables and the sandbox
account's own `TEMP`.

The `sandbox-windows` CI job proves the fence twice on a real Windows machine after srt's one-time
install: first with plain canary probes (`scripts/windows-fence-probe.mjs`), then through a session
(`pnpm test:fence:windows`). The session test needs the session to report `fenced`, the program
not to be able to read the hidden file, the blocked port and its own variables as the profile
says, and `kill` to end its process tree. It works outside the user's profile, because the sandbox account can't look
inside the profile of the user who ran the install. The same fence tests for Linux and macOS run
with `pnpm test:fence`.

## Exports

| Export                     | What it is                                                                        |
| -------------------------- | --------------------------------------------------------------------------------- |
| `SrtSandbox`               | The `Sandbox` port: `check()`, `capabilities()` and `open()`.                     |
| `buildSrtConfig`           | Turns a `SandboxProfile` into sandbox-runtime settings.                           |
| `recoverGitFolders`        | After a host crash, undoes the `commondir` files of sessions whose host has died. |
| `Machine`, `systemMachine` | What the sandbox asks of the machine; a test passes a fake `Machine`.             |
| `Runner`, `srtRunner`      | Starts a program inside the fence; a test passes a fake `Runner`.                 |

`new SrtSandbox(machine?, runner?, journalFolder?)` takes the real machine and runner by default.
Give `journalFolder` (a folder only this user can write) to keep the snapshot `recoverGitFolders`
needs; without it, nothing is kept and a crash is not recovered. On Windows the folder gets an
access list for this user alone (`icacls`, no inheritance) each time it is prepared or recovered.

## Example

```ts
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { SandboxProfile } from "@halonicjs/ports";

declare const profile: SandboxProfile;

const sandbox = new SrtSandbox();
const check = await sandbox.check();
if (check.ok) {
  const session = await sandbox.open(profile);
  await session.close();
}
```

## Ending a program on macOS

A signal to the process group ends a program and what it started, but a program can move a child out of the group with `setsid`. Linux ends those with the sandbox itself (bubblewrap). Seatbelt has no such tie, so on macOS every program starts with a variable `HALONIC_SRT_RUN=<random id>`, and when the program ends or is killed the runner kills every process of the same user that carries it. It repeats until a pass finds nothing (at most 20 passes).

**Limit:** a program that clears its own environment (`env -i`) and then detaches isn't found. The leftover process stays inside Seatbelt, so it has no network once srt's proxy ends, but it can still write to the working folder until it exits.
