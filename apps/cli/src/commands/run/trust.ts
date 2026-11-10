// The trust check before `halonic run` starts anything (cli-output 3.4,
// "Untrusted workspace"). A run runs the workspace's models, programs and
// connectors, so the workspace must be trusted on this computer first,
// unless the run can only reach the built-in test model (Liam, HAL-1984;
// the rule is `reachesOnlyTheTestModel` in the workspace package, which
// Studio uses too): then nothing outside Halonic starts, and
// `init --example acme` runs straight away. The service that starts the run
// doesn't check trust; each surface asks in its own way (Liam, HAL-3895).

import type { Clock, TrustStore } from "@halonicjs/ports";
import { filesOf, type LoadedWorkspace, reachesOnlyTheTestModel } from "@halonicjs/workspace";
import type { CommandSearch } from "../../command-paths.ts";
import { runMessages } from "../../messages/run.ts";
import { trustMessages } from "../../messages/trust.ts";
import { NotTrustedError } from "../../not-trusted.ts";
import { trustChangesDocument } from "../../output/trust-changes-json.ts";
import { trustCheckLines } from "../../output/trust-check.ts";
import type { OpenWorkspaceDir } from "../../workspace-dir.ts";
import { cliTrustService, readWorkspaceTrust, trustContentInputOf } from "../../workspace-trust.ts";

/** What the trust check reads on this computer, so tests can hand it a memory store. */
export interface RunTrustMachine {
  /** The trust records in the user's profile. */
  readonly trustStore: TrustStore;
  readonly clock: Clock;
  /** Where the connectors' programs are looked for. */
  readonly commandSearch: CommandSearch;
}

/**
 * Refuses to go on unless the workspace is trusted on this computer, or
 * its run can only reach the test model. A trust record that can't be read
 * counts as no trust: the run fails closed.
 *
 * @throws NotTrustedError when the workspace was never trusted here, or
 *   changed since; its check and fingerprint are shown, and nothing ran (exit 3)
 */
export async function checkRunTrust(
  dir: OpenWorkspaceDir,
  workspace: LoadedWorkspace,
  machine: RunTrustMachine,
  typedDir: string | undefined,
): Promise<void> {
  const providers = filesOf(workspace, "provider").map((file) => file.value);
  if (reachesOnlyTheTestModel({ providers, ...trustContentInputOf(workspace) })) {
    return;
  }
  const { name, subject } = await readWorkspaceTrust(dir, machine.commandSearch);
  const check = await cliTrustService(machine.trustStore, machine.clock).check(subject);
  if (check.status === "trusted") {
    return;
  }
  const changed = check.status === "changed";
  throw new NotTrustedError({
    problem: changed ? runMessages.changedSinceTrusted(name) : runMessages.notTrusted(name),
    fix: trustMessages.reviewThenTrust(typedDir),
    fingerprint: check.fingerprint,
    check: trustCheckLines(check, { name, folder: dir.shown }),
    changes: changed ? trustChangesDocument(check.changes, check.trustedAt) : undefined,
  });
}
