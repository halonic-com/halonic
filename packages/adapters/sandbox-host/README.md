# @halonicjs/adapter-sandbox-host

The launcher (`sandbox-host`): it finds programs on this machine, and starts programs without a fence for the runs the user confirmed without the sandbox.

- **Layer:** adapters
- **Owner:** mateo
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sandbox-host`

It has the real `ProgramProbe` (`createProgramProbe`, with `ProgramProbeOptions` for the
environment and the time limit), and the launcher's `Sandbox` (`createHostSandbox`).

### The probe

`createProgramProbe`:

- finds a program by bare name on the launcher's PATH with `findProgram` from
  `@halonicjs/adapter-system-node`, skipping empty and relative entries and never the current
  folder. A name with a path separator, or an empty name, is `missing` and nothing is started. On
  Windows it looks only for `.exe`, never `.com`, `.cmd` or `.bat`;
- starts it with no shell and only `PATH`, `HOME` and the locale variables (`LANG`, `LC_ALL`,
  `LC_CTYPE`, `LC_MESSAGES`), so no tokens or keys;
- ends it after 5 seconds (`timeoutMs`) with a `failed` answer in one plain sentence, and cuts
  `stdout` and `stderr` at 4 KB each;
- stops what the program started once it has ended or been stopped, on POSIX by ending its process
  group. Windows is left for later, and a child that starts its own session can escape: that is the
  sandbox's job;
- stops a probe that is still running when the launcher exits or gets Ctrl-C (`SIGINT`) or `SIGTERM`,
  because the probe has its own process group and the signal wouldn't reach it. The launcher starts
  watching for these signals before the probe starts, so a signal that comes first can't leave the
  probe running. If nothing else in the launcher listens for that signal, it is raised again so the
  launcher still ends;
- never throws.

### The launcher's sandbox, without a fence

`createHostSandbox` is the `Sandbox` for the runs the user confirmed without the sandbox: the
integration runner where the sandbox can't start (HAL-958 design 4.3), and later an agent the person
placed on this computer. It decides nothing: whether a start may come here is decided before,
from the fenced sandbox's `check()` and the user's saved yes (`UnfencedRuns` in `core/app`). See
[the ADR](../../../docs/adr/2026-11-11-sandbox-without-fence.md). It:

- says so: its strength is `none`, its `check()` is always `ok`, and each session's fence proof
  is `off` until it closes, then `stopped`;
- starts a program with no shell and only the profile's variables, never the launcher's own, in
  the working folder or a folder inside it;
- finds a bare program name on the profile's `PATH`, never in the working folder. A program it
  can't find or start ends with exit code 127 instead of throwing, as inside the fence;
- refuses a program, argument or folder under a skill's `scripts/` folder, as written or through
  a symbolic link, before anything starts;
- stops a program and its process group (on Windows its process tree, with `taskkill /T /F`) on
  `kill`, on `close`, when the time limit runs out and when the open signal aborts: SIGTERM
  first, SIGKILL after 2 seconds. It also stops them when the launcher exits or gets SIGINT or
  SIGTERM, as the probe does. On Windows, a child whose parent has already ended is not found;
- reports no blocked accesses, because nothing is fenced off. The profile's read, deny and
  network lists are not enforced: only Node's permission layer, which the runner turns on
  itself, limits the program.

## Example

```ts
import { createHostSandbox, createProgramProbe } from "@halonicjs/adapter-sandbox-host";

const answer = await createProgramProbe().ask("claude", ["--version"]);

const session = await createHostSandbox().open(profile);
const program = await session.start({ program: nodePath, args: ["runner.mjs"] });
```
