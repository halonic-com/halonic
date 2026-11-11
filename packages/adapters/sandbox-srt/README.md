# @halonicjs/adapter-sandbox-srt

The `Sandbox` port on [sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (srt): bubblewrap on Linux, Seatbelt on macOS, and on Windows a sandbox user account with network filters (srt's alpha Windows mode, only when its install is there; WSL2 also works).

- **Layer:** adapters
- **Owner:** mateo
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sandbox-srt`

`SrtSandbox` is the whole adapter. `check()` says whether the sandbox can start on this machine and
gives the first reason when it can't: Windows without srt's install (`setup-needed`; `srt windows-install`, once, as an administrator), inside a container (Docker or Podman), user
namespaces refused, bubblewrap missing, or `socat` or ripgrep (`rg`) missing, which srt starts next to bubblewrap
(`linux-tools-missing`). `open()` checks first, refuses a bridge that isn't a
loopback address, then opens a session that proves its fence (a canary file the fence hides and a
loopback port it blocks) before any program starts. Programs never start without a proven fence, and
never run a file under a skill's `scripts/` folder. When a session ends, it undoes any `commondir`
file the program changed in the working folder's git folders and moves aside any `.git` the program
planted at a gitlink, reporting each as a refused write.

On Linux and macOS the launcher gets its own temp folder, private to the user, directly under
`/tmp` and removed when the session ends. srt puts its Unix sockets in the launcher's temp folder,
and a socket path holds at most 104 bytes on macOS: under the session's temp folder, which holds the
user's name and the run id, it would be too long. The session's temp folder goes to srt as
`CLAUDE_CODE_TMPDIR`, and stays the program's `TMPDIR`.

`setUp()` is the one-time setup the installer runs as an administrator (through the agent host's
`--sandbox-setup`). On Windows it runs srt's install (what `srt windows-install` runs), then checks:
it is `ok` only when `check()` then passes, and otherwise gives one line on why not. Running it again
repairs the install or changes nothing. The install is for the whole machine (the sandbox account,
its password in `HKLM` and the network filters), so it serves every user, also when an administrator
other than the person at the keyboard answered the prompt. It leaves out srt's profile read grant,
which would let every sandboxed program on the machine read the user's profile, including files that
can hold tokens (`.npmrc`, `.gitconfig`); a session reads only the folders its profile names. Other
systems have no setup step.

srt grants a session its folders, not the folders above them, and without the profile grant the
sandbox account can't even look at a folder inside the user profile. Node checks each folder above a
script before it runs it, so it couldn't start from `%LOCALAPPDATA%\halonic\…` (HAL-5885). Before
a Windows session opens, `open()` therefore gives the sandbox account read attributes (`(RA)`) on
each folder between the user profile and the paths it grants, on that folder alone: it sees the
folder's dates and flags, never what it holds. The entry stays when the session closes, since other
sessions share those folders; a folder that has it already is left alone.

`remove()` undoes it for the uninstaller (through the agent host's `--sandbox-remove`). On Windows it
runs srt's uninstall (what `srt windows-uninstall` runs): the sandbox account and its profile, the
sandbox group, the network filters, the `HKLM\SOFTWARE\sandbox-runtime` key, and the write grants
kept on project folders by sessions of the user it runs as. It is `ok` when nothing was set up, and
when run again. srt removes nothing while a sandboxed program runs, and leaves
`%ProgramData%\sandbox-runtime` (its CA key folder) in place. Other systems have nothing to remove.

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
inside the profile of the user who ran the install. A second test
(`fence/profile-folders.windows.test.ts`) puts the session's folders where the host keeps them, under
`%LOCALAPPDATA%`, and checks that Node starts there, resolves its script and writes both
folders. The same fence tests for Linux and macOS run
with `pnpm test:fence`.

The report-only `sandbox-windows-spike` CI workflow also runs `scripts/windows-isolation-probe.mjs` when that
script changes. Among its results, it checks that a session on project B can neither write in nor
delete from a project A whose grant an earlier session kept (`kept-roots-writable`). Session B's
checks pass only on an explicit `blocked:` answer; a crash, empty output or any other text is
`INCONCLUSIVE`, not a pass. It writes
`windows-isolation-results.json`; it doesn't gate a merge.

The same workflow runs `scripts/windows-wsl-probe.mjs`. It checks whether srt's sandbox account can register and start a WSL distro of
its own (and, if it can, whether that distro reads a denied file or reaches a blocked port), and
whether WSL 2 starts on the runner at all. It writes `windows-wsl-results.json`.

## Exports

| Export | What it is |
| --- | --- |
| `SrtSandbox` | The `Sandbox` port: `check()`, `capabilities()` and `open()`. |
| `buildSrtConfig` | Turns a `SandboxProfile` into sandbox-runtime settings. |
| `recoverGitFolders` | After a host crash, undoes the `commondir` files of sessions whose host has died. |
| `Machine`, `systemMachine` | What the sandbox asks of the machine; a test passes a fake `Machine`. |
| `Runner`, `srtRunner` | Starts a program inside the fence; a test passes a fake `Runner`. |

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
