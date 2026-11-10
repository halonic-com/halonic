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
