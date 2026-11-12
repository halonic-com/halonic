// The trust check before `halonic run` starts anything (cli-output 3.4,
// "Untrusted workspace"). A run runs the workspace's models, programs and
// connectors, so the workspace must be trusted on this computer first,
// unless the run can only reach the built-in test model (Liam, HAL-1984;
// the rule is `reachesOnlyTheTestModel` in the workspace package, so
// Studio can use it too): then nothing outside Halonic starts, and
// `init --example acme` runs straight away. The service that starts the run
// doesn't check trust; each surface asks in its own way (Liam, HAL-3895).

import type { TrustGrant } from "@halonicjs/ports";
import { type LoadedWorkspace, reachesOnlyTheTestModel } from "@halonicjs/workspace";
import type { Message } from "../../messages/define.ts";
import { runMessages } from "../../messages/run.ts";
import { startsAProgram } from "../../sandbox-gate.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";
import { refuseFileProblems } from "../../workspace-problems.ts";
import {
  trustContentInputOf,
  trustedGrant,
  type WorkspaceTrustMachine,
  workspaceIntegrations,
} from "../../workspace-trust.ts";

/** What the trust check reads on this computer, so tests can hand it a memory store. */
export type RunTrustMachine = WorkspaceTrustMachine;

/**
 * Refuses to go on when the workspace's files have errors, then unless the
 * workspace is trusted on this computer, or its run can only reach the test
 * model. A file with an error is left out of the loaded workspace, so the
 * trust rule would judge a workspace the user didn't write, such as one
 * whose provider file was dropped for a pasted key (HAL-6613). A run that names a harness program
 * for all its agents, such as with `--harness codex`, reaches more than the
 * test model, so it always needs trust. A trust record that can't be read
 * counts as no trust: the run fails closed. `runs send` checks it too before
 * a run goes on.
 *
 * @param nothingDone - the end of line 1 saying nothing happened:
 *   `runMessages.nothingRan()`, the default, or `sandboxMessages.nothingSent()`
 * @param harness - the harness the run names for all its agents, if any
 * @returns the trust grant the run's connectors start with, or `null` for a
 *   run that can only reach the test model, which starts no program
 * @throws WorkspaceFileProblemsError when `halonic validate` would find an
 *   error in the workspace's files; nothing ran (exit 2)
 * @throws NotTrustedError when the workspace was never trusted here, or
 *   changed since; its check and fingerprint are shown, and nothing ran (exit 3)
 */
export async function checkRunTrust(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  machine: RunTrustMachine,
  typedDir: string | undefined,
  nothingDone: Message = runMessages.nothingRan(),
  harness?: string,
): Promise<TrustGrant | null> {
  refuseFileProblems(dir, workspace, nothingDone, typedDir);
  const integrations = await workspaceIntegrations(dir.root, dir.shown);
  if (
    !startsAProgram(harness) &&
    reachesOnlyTheTestModel(trustContentInputOf(workspace, integrations))
  ) {
    return null;
  }
  return await trustedGrant(dir, machine, typedDir, nothingDone, workspace);
}
