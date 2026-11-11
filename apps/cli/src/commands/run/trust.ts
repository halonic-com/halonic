// The trust check before `halonic run` starts anything (cli-output 3.4,
// "Untrusted workspace"). A run runs the workspace's models, programs and
// connectors, so the workspace must be trusted on this computer first,
// unless the run can only reach the built-in test model (Liam, HAL-1984;
// the rule is `reachesOnlyTheTestModel` in the workspace package, so
// Studio can use it too): then nothing outside Halonic starts, and
// `init --example acme` runs straight away. The service that starts the run
// doesn't check trust; each surface asks in its own way (Liam, HAL-3895).

import { filesOf, type LoadedWorkspace, reachesOnlyTheTestModel } from "@halonicjs/workspace";
import type { Message } from "../../messages/define.ts";
import { runMessages } from "../../messages/run.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";
import {
  trustContentInputOf,
  trustedGrant,
  type WorkspaceTrustMachine,
} from "../../workspace-trust.ts";

/** What the trust check reads on this computer, so tests can hand it a memory store. */
export type RunTrustMachine = WorkspaceTrustMachine;

/**
 * Refuses to go on unless the workspace is trusted on this computer, or
 * its run can only reach the test model. A trust record that can't be read
 * counts as no trust: the run fails closed. `runs send` checks it too before
 * a run goes on.
 *
 * @param nothingDone - the end of line 1 saying nothing happened:
 *   `runMessages.nothingRan()`, the default, or `sandboxMessages.nothingSent()`
 * @throws NotTrustedError when the workspace was never trusted here, or
 *   changed since; its check and fingerprint are shown, and nothing ran (exit 3)
 */
export async function checkRunTrust(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  machine: RunTrustMachine,
  typedDir: string | undefined,
  nothingDone: Message = runMessages.nothingRan(),
): Promise<void> {
  const providers = filesOf(workspace, "provider").map((file) => file.value);
  if (reachesOnlyTheTestModel({ providers, ...trustContentInputOf(workspace) })) {
    return;
  }
  await trustedGrant(dir, machine, typedDir, nothingDone, workspace);
}
