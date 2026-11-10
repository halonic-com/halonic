# @halonicjs/adapter-sandbox-srt

The `Sandbox` port on [sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (srt): bubblewrap on Linux, Seatbelt on macOS, and no sandbox on plain Windows yet (WSL2 works).

- **Layer:** adapters
- **Owner:** mateo
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sandbox-srt`

`SrtSandbox` is the whole adapter. `check()` says whether the sandbox can start on this machine and
gives the first reason when it can't: plain Windows, inside a container (Docker or Podman), user
namespaces refused, or bubblewrap missing. `open()` checks first, refuses a bridge that isn't a
loopback address, then opens a session that proves its fence (a canary file the fence hides and a
loopback port it blocks) before any program starts. Programs never start without a proven fence, and
never run a file under a skill's `scripts/` folder. When a session ends, it undoes any `commondir`
file the program changed in the working folder's git folders and moves aside any `.git` the program
planted at a gitlink, reporting each as a refused write.

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
needs; without it, nothing is kept and a crash is not recovered.

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
