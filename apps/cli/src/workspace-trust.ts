// What the trust check covers in a workspace, read the one way every command
// that checks trust reads it (`doctor`, `trust`, and `run` when it lands), so
// they all compute one fingerprint for the same files on the same computer.

import { realpath } from "node:fs/promises";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import { TrustService, type TrustSubject } from "@halonicjs/app";
import type { Clock, TrustGrant, TrustStore } from "@halonicjs/ports";
import {
  filesOf,
  type LoadedWorkspace,
  type LocalIntegrationInput,
  loadWorkspace,
} from "@halonicjs/workspace";
import { type CommandSearch, commandPaths } from "./command-paths.ts";
import type { Message } from "./messages/define.ts";
import { runMessages } from "./messages/run.ts";
import { trustMessages } from "./messages/trust.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { trustChangesDocument } from "./output/trust-changes-json.ts";
import { trustCheckLines } from "./output/trust-check.ts";
import { halonicVersion } from "./version.ts";
import type { OpenWorkspaceDir, WorkspaceDir } from "./workspace-dir.ts";
import { readLocalIntegrations } from "./workspace-integrations.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

/** What {@link trustSubjectOf} reads. */
export interface TrustSubjectInput {
  /** The workspace, loaded. Files with an error are left out, as `loadWorkspace` does. */
  readonly workspace: LoadedWorkspace;
  /** The workspace's local integrations, from {@link workspaceIntegrations}. */
  readonly integrations: readonly LocalIntegrationInput[];
  /** The workspace's resolved real path: the trust record's key. */
  readonly location: string;
  /** The absolute path each connector's command resolves to on this computer. */
  readonly commandPaths: ReadonlyMap<string, string>;
}

/**
 * Every connector, agent and model provider of the workspace, of the root
 * and of every hub, and its local integrations, as the trust check
 * fingerprints them.
 */
export function trustSubjectOf(input: TrustSubjectInput): TrustSubject {
  return {
    location: input.location,
    ...trustContentInputOf(input.workspace, input.integrations),
    commandPaths: input.commandPaths,
  };
}

/**
 * The connectors, agents and model providers of the workspace, of the root
 * and of every hub, and its local integrations: what its trust content is
 * built from, apart from where the programs are on this computer.
 */
export function trustContentInputOf(
  workspace: LoadedWorkspace,
  integrations: readonly LocalIntegrationInput[],
): Pick<TrustSubject, "connectors" | "agents" | "integrations" | "providers"> {
  return {
    connectors: filesOf(workspace, "connector").map((file) => file.value),
    agents: filesOf(workspace, "agent").map((file) => file.value),
    integrations,
    providers: filesOf(workspace, "provider").map((file) => file.value),
  };
}

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
 * the folder as typed when it has none. The trust line and `runs send`'s
 * id errors both say it, so one workspace reads one way (HAL-4533).
 *
 * @example
 * workspaceNameOf(loaded, { shown: "./acme", … }); // "Acme"
 */
export function workspaceNameOf(workspace: LoadedWorkspace, dir: WorkspaceDir): string {
  return filesOf(workspace, "workspace")[0]?.value.name ?? dir.shown;
}

/** A workspace as a trust check is about it. */
export interface WorkspaceTrust {
  /** The workspace's name from `workspace.yaml`, or the folder as typed when it has none. */
  readonly name: string;
  readonly subject: TrustSubject;
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
  const connectors = filesOf(workspace, "connector").map((file) => file.value);
  const subject = trustSubjectOf({
    workspace,
    integrations: await workspaceIntegrations(dir.root, dir.shown),
    location: await realpath(dir.root),
    commandPaths: await commandPaths(connectors, search),
  });
  return { name, subject };
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
 */
export async function trustedGrant(
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
  typedDir: string | undefined,
  nothingDone: Message,
  loaded: LoadedWorkspace,
): Promise<TrustGrant> {
  const { name, subject } = await readWorkspaceTrust(dir, machine.commandSearch, loaded);
  const check = await cliTrustService(machine.trustStore, machine.clock).check(subject);
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
    check: trustCheckLines(check, { name, folder: dir.shown }),
    changes: changed ? trustChangesDocument(check.changes, check.trustedAt) : undefined,
  });
}
