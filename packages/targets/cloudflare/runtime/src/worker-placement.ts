// Where a harness step runs on the Worker (requirement `runtime.worker-placement`): always in the
// run's container. The Worker has no "this computer" for a program to run on unfenced, so that
// placement gets a sandbox whose check never passes, and nothing can start there.

import type { PlacementPolicy } from "@halonicjs/engine";
import type { Sandbox, SandboxCheck } from "@halonicjs/ports";

/** Every agent runs in the sandbox: no person on the Worker can choose otherwise. */
export const workerPlacement: PlacementPolicy = {
  where: async () => ({ runsOn: "sandbox" }),
};

/** The check of the Worker's `this-computer` sandbox: never ok. */
const notOffered: SandboxCheck = {
  ok: false,
  reason: "not-offered",
  missing: ["The Cloudflare Worker runs harness programs only in the run's container."],
};

/**
 * The Worker's sandbox for `this-computer`. Its check is never ok, so the engine refuses a step
 * placed there before anything starts; `open` refuses too, in case anything asks it anyway.
 */
export const notOfferedSandbox: Sandbox = {
  check: async () => notOffered,
  capabilities: () => ({ files: "copied", strength: "remote" }),
  open: async () => {
    throw new Error(notOffered.missing.join(" "));
  },
};
