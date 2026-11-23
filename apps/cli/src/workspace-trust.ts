// What the trust check covers in a workspace, read the one way every command
// that checks trust reads it (`doctor`, `trust`, and `run` when it lands), so
// they all compute one fingerprint for the same files on the same computer.
// Reading trust lives in the workspace engine, so the agent host's engine
// role reads it the same way (HAL-17049); granting stays here.

import {
  readWorkspaceTrust,
  refusedFilesOf,
  type TrustReadMachine,
  type WorkspaceAtVersion,
  type WorkspaceTrust,
} from "@halonicjs/adapter-workspace-engine-node";
import { type TrustCheck, TrustService } from "@halonicjs/app";
import type { Clock, KeyOrigins, TrustGrant, TrustStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { keyAddressLists } from "./key-address-lists.ts";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { trustMessages } from "./messages/trust.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { printable } from "./output/printable.ts";
import { trustChangesDocument } from "./output/trust-changes-json.ts";
import { type FingerprintedCheck, trustCheckLines } from "./output/trust-check.ts";
import type { PluginHosts } from "./sheet-hosts.ts";
import { halonicVersion } from "./version.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

// Moved to the workspace engine (HAL-17049); re-exported so the CLI's many
// callers keep one import for trust.
export {
  needsNoTrust,
  readWorkspaceTrust,
  refusedFileKey,
  type WorkspaceTrust,
  type WorkspaceTrustAnswer,
  type WorkspaceTrustState,
  workspaceNameOf,
  workspaceTrustState,
} from "@halonicjs/adapter-workspace-engine-node";

/**
 * Stops when the check is `refused`: a file names something trust can't
 * cover, such as a connector URL with user info, so the workspace has no
 * fingerprint and nothing in it can start until the file is fixed (HAL-5421).
 *
 * @throws KindedError `invalid_input` naming each file and why, never its address (exit 2)
 */
export function assertTrustable(
  check: TrustCheck,
  workspace: WorkspaceTrust,
): asserts check is FingerprintedCheck {
  if (check.status !== "refused") {
    return;
  }
  throw new KindedError(
    "invalid_input",
    plainText(trustMessages.refused(refusedFilesOf(check, workspace)).phrase),
    { fix: plainText(trustMessages.refusedFix().phrase) },
  );
}

/** The trust service over `store`, with the CLI's digest and version. */
export function cliTrustService(store: TrustStore, clock: Clock): TrustService {
  return new TrustService({ store, digest: webCryptoDigest, clock, appVersion: halonicVersion });
}

/** What a trust check reads on this computer, so tests can hand it a memory store. */
export interface WorkspaceTrustMachine extends TrustReadMachine {
  /** Whether the sandbox works here; left out, the check shows no program's sites. */
  readonly sandboxWorks?: () => Promise<boolean>;
  /** The hosts of the plugins installed here; left out, the check shows no plugin's hosts. */
  readonly pluginHosts?: () => Promise<PluginHosts>;
  /** The stored keys' lists of addresses; left out, the check reads no key's list. */
  readonly keyOrigins?: KeyOrigins;
}

/**
 * The grant for the workspace in `dir` as it is now, which a connector
 * needs to start (`ports.connector-trust-enforcement`). A trust record that
 * can't be read counts as no trust, so this fails closed.
 *
 * @param nothingDone - the end of line 1 saying nothing happened, such as
 *   `runMessages.nothingRan()`
 * @param version - the workspace and its integrations as they will be
 *   used, such as the live version a run starts. It is required so trust
 *   is checked on what is used, never on a second read of the files
 * @throws NotTrustedError when the workspace was never trusted here, or
 *   changed since; its check and fingerprint are shown (exit 3)
 * @throws KindedError when a file names something that can't be trusted (exit 2)
 */
export async function trustedGrant(
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
  typedDir: string | undefined,
  nothingDone: Message,
  version: WorkspaceAtVersion,
): Promise<TrustGrant> {
  const workspace = await readWorkspaceTrust(dir, machine.commandSearch, version);
  const { subject } = workspace;
  // Escaped for the ✕ line, which is printed after the check (HAL-11883).
  const name = printable(workspace.name);
  const check = await cliTrustService(machine.trustStore, machine.clock).check(subject);
  assertTrustable(check, workspace);
  if (check.status === "trusted") {
    return check.grant;
  }
  const changed = check.status === "changed";
  throw new NotTrustedError({
    problem: changed
      ? runMessages.changedSinceTrusted(name, nothingDone.phrase)
      : runMessages.notTrusted(name, nothingDone.phrase),
    fix: trustMessages.reviewThenTrust(typedDir),
    fingerprint: check.fingerprint,
    check: trustCheckLines(check, {
      name,
      folder: dir.shown,
      sandboxWorks: (await machine.sandboxWorks?.()) === true,
      pluginHosts: (await machine.pluginHosts?.()) ?? new Map(),
      keyAddresses: await keyAddressLists(check, machine.keyOrigins),
    }),
    changes: changed ? trustChangesDocument(check.changes, check.trustedAt) : undefined,
  });
}
