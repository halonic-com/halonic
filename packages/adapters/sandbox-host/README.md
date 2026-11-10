# @halonicjs/adapter-sandbox-host

The launcher (`sandbox-host`): it finds programs on this machine and, in later steps, starts the sandboxed program.

- **Layer:** adapters
- **Owner:** mateo
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sandbox-host`

This package is built in steps (HAL-193). So far it has the real `ProgramProbe`
(`createProgramProbe`, with `ProgramProbeOptions` for the environment and the time limit). It:

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
- never throws.

Starting the sandboxed program follows later.

## Example

```ts
import { createProgramProbe } from "@halonicjs/adapter-sandbox-host";

const answer = await createProgramProbe().ask("claude", ["--version"]);
```
