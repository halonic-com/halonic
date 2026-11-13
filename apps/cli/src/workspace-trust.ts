// What the trust check covers in a workspace, read the one way every command
// that checks trust reads it (`doctor`, `trust`, and `run` when it lands), so
// they all compute one fingerprint for the same files on the same computer.

import { realpath } from "node:fs/promises";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import {
  readLocalIntegrations,
  type TrustCheck,
  TrustService,
  type TrustSubject,
  trustSubjectOf,
} from "@halonicjs/app";
import type { Clock, TrustGrant, TrustStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import {
  filesOf,
  type LoadedWorkspace,
  type LocalIntegrationInput,
  loadWorkspace,
  type RefusedKind,
} from "@halonicjs/workspace";
import { type CommandSearch, commandPaths } from "./command-paths.ts";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { trustMessages } from "./messages/trust.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { trustChangesDocument } from "./output/trust-changes-json.ts";
import { type FingerprintedCheck, trustCheckLines } from "./output/trust-check.ts";
import { halonicVersion } from "./version.ts";
import type { OpenWorkspaceDir, WorkspaceDir } from "./workspace-dir.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

/**
 * The local integrations in the workspace folder `root`, read without
 * following links and hashed as a runner start hashes them. Every command
 * that checks trust reads them this way, so they all see the same code.
 *
 * @param root - the workspace folder
 * @param shown - the folder as the user typed it, such as `./acme`
 */
export async function workspaceIntegrations(
  root: string,
  shown: string,
): Promise<LocalIntegrationInput[]> {
  return await readLocalIntegrations(new FileSystemFolderReader(root, shown), webCryptoDigest);
}

/**
 * The workspace's name as a sentence names it: from `workspace.yaml`, or
 * the folder's own name when it has none, so a workspace run from inside
 * its folder is "acme", not "." (HAL-6810). Every sentence that names a loaded
 * workspace says it (the trust line, `run`, `runs`, `routines`), so one
 * workspace reads one way (HAL-4533, HAL-6610).
 *
 * @example
 * workspaceNameOf(loaded, { shown: "./acme", … }); // "Acme"
 * workspaceNameOf(unnamed, { shown: ".", name: "acme", … }); // "acme"
 */
export function workspaceNameOf(workspace: LoadedWorkspace, dir: WorkspaceDir): string {
  return filesOf(workspace, "workspace")[0]?.value.name ?? dir.name;
}

/** A workspace as a trust check is about it. */
export interface WorkspaceTrust {
  /** The workspace's name from `workspace.yaml`, or the folder's own name when it has none. */
  readonly name: string;
  readonly subject: TrustSubject;
  /**
   * Each connector's and provider's file, workspace-relative, by
   * {@link refusedFileKey}, so a refusal can say which file to fix.
   */
  readonly files: ReadonlyMap<string, string>;
}

/**
 * The key of a connector's or provider's file in {@link WorkspaceTrust.files}.
 * A connector and a provider may share an id, so the kind is part of it.
 *
 * @example
 * refusedFileKey("provider", "claude"); // "provider:claude"
 */
export function refusedFileKey(kind: RefusedKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Loads the workspace in `dir`, reads its local integrations and finds each
 * connector's program on this computer, for a trust check. A run passes the
 * workspace it starts, the live version, so trust is checked on what runs,
 * not on the saved files.
 *
 * @example
 * await readWorkspaceTrust(await openWorkspaceDir(input, io), nodeCommandSearch());
 * // { name: "Acme", subject: { location: "/work/acme", connectors: [ … ], … } }
 */
export async function readWorkspaceTrust(
  dir: OpenWorkspaceDir,
  search: CommandSearch,
  loaded?: LoadedWorkspace,
): Promise<WorkspaceTrust> {
  const workspace = loaded ?? (await loadWorkspace(dir.store));
  const name = workspaceNameOf(workspace, dir);
  const connectorFiles = filesOf(workspace, "connector");
  const connectors = connectorFiles.map((file) => file.value);
  const subject = trustSubjectOf({
    workspace,
    integrations: await workspaceIntegrations(dir.root, dir.shown),
    location: await realpath(dir.root),
    commandPaths: await commandPaths(connectors, search),
  });
  const files = new Map([
    ...connectorFiles.map(
      (file) => [refusedFileKey("connector", file.value.id), file.path] as const,
    ),
    ...filesOf(workspace, "provider").map(
      (file) => [refusedFileKey("provider", file.value.id), file.path] as const,
    ),
  ]);
  return { name, subject, files };
}

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
  const refused = check.refused.map(({ kind, id, reason }) => ({
    file: workspace.files.get(refusedFileKey(kind, id)) ?? id,
    reason,
  }));
  throw new KindedError("invalid_input", plainText(trustMessages.refused(refused).phrase), {
    fix: plainText(trustMessages.refusedFix().phrase),
  });
}

/** The trust service over `store`, with the CLI's digest and version. */
export function cliTrustService(store: TrustStore, clock: Clock): TrustService {
  return new TrustService({ store, digest: webCryptoDigest, clock, appVersion: halonicVersion });
}

/** What a trust check reads on this computer, so tests can hand it a memory store. */
export interface WorkspaceTrustMachine {
  /** The trust records in the user's profile. */
  readonly trustStore: TrustStore;
  readonly clock: Clock;
  /** Where the connectors' programs are looked for. */
  readonly commandSearch: CommandSearch;
  /** Whether the sandbox works here; left out, the check shows no program's sites. */
  readonly sandboxWorks?: () => Promise<boolean>;
}

/**
 * The grant for the workspace in `dir` as it is now, which a connector
 * needs to start (`ports.connector-trust-enforcement`). A trust record that
 * can't be read counts as no trust, so this fails closed.
 *
 * @param nothingDone - the end of line 1 saying nothing happened, such as
 *   `runMessages.nothingRan()`
 * @param loaded - the workspace as it will be used, such as the live
 *   version a run starts. It is required so trust is checked on what is
 *   used, never on a second read of the files
 * @throws NotTrustedError when the workspace was never trusted here, or
 *   changed since; its check and fingerprint are shown (exit 3)
 * @throws KindedError when a file names something that can't be trusted (exit 2)
 */
export async function trustedGrant(
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
  typedDir: string | undefined,
  nothingDone: Message,
  loaded: LoadedWorkspace,
): Promise<TrustGrant> {
  const workspace = await readWorkspaceTrust(dir, machine.commandSearch, loaded);
  const { name, subject } = workspace;
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
    }),
    changes: changed ? trustChangesDocument(check.changes, check.trustedAt) : undefined,
  });
}
