# @halonicjs/adapter-doctor-node

The Node half of `halonic doctor`: the doctor service on a computer's parts, a workspace read as the doctor checks it, and the model servers on this computer it asks. The CLI and the agent host each build the machine from their own parts, so they run one doctor, not two (HAL-13407).

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-doctor-node`

## Example

```ts
import { doctorService, doctorWorkspace } from "@halonicjs/adapter-doctor-node";

const workspace = doctorWorkspace({ workspace: loaded, integrations, location, fallbackName: "acme", commandPaths });
const doctor = await doctorService(machine, secrets, { workspace, providerFiles }, { appVersion: "0.1.0" });
const report = await doctor.check(workspace);
// report.sandbox: { check: "sandbox", status: "ok", … }
```

The machine (`DoctorMachine`) is a parameter: the CLI's has its WSL, Node.js and pnpm parts; a caller leaves out a part it can't answer for, and its line is left out of the report.
