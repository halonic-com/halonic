# @halonicjs/adapter-sandbox-host

The launcher (`sandbox-host`): it finds programs on this machine and, in later steps, starts the sandboxed program.

- **Layer:** adapters
- **Owner:** mateo
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sandbox-host`

This package is built in steps (HAL-193). So far it has the real `ProgramProbe`: it finds a program by
bare name on the launcher's PATH, starts it with no shell, a small environment (no tokens or keys), a
5-second limit and output cut at 4 KB, and never throws. Starting the sandboxed program follows later.

## Example

```ts
import { createProgramProbe } from "@halonicjs/adapter-sandbox-host";

const answer = await createProgramProbe().ask("claude", ["--version"]);
```
