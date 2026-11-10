# @halonicjs/adapter-sandbox-srt

The `Sandbox` port on [sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (srt): bubblewrap on Linux, Seatbelt on macOS, and no sandbox on plain Windows yet (WSL2 works).

- **Layer:** adapters
- **Owner:** mateo
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sandbox-srt`

This package is built in steps (HAL-193). So far it turns a `SandboxProfile` into srt settings and
`SrtSandbox.check()` says whether the sandbox can start on this machine: plain Windows, inside a
container (Docker or Podman), user namespaces refused, or bubblewrap missing. `open()` is still a
stub. The session, the fence proof and the attack suites follow in later pull requests.

## Example

```ts
import { buildSrtConfig } from "@halonicjs/adapter-sandbox-srt";

const settings = buildSrtConfig(profile);
```

## Ending a program on macOS

A signal to the process group ends a program and what it started, but a program can move a child out of the group with `setsid`. Linux ends those with the sandbox itself (bubblewrap). Seatbelt has no such tie, so on macOS every program starts with a variable `HALONIC_SRT_RUN=<random id>`, and when the program ends or is killed the runner kills every process of the same user that carries it. It repeats until a pass finds nothing (at most 20 passes).

**Limit:** a program that clears its own environment (`env -i`) and then detaches isn't found. The leftover process stays inside Seatbelt, so it has no network once srt's proxy ends, but it can still write to the working folder until it exits.
