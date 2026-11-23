// Where a workspace stands with trust on this computer, read the one way
// the CLI and the agent host's engine role read it (HAL-17049), so they
// never disagree about the same folder. It only reads trust: nothing here
// grants trust or writes a trust record. Granting stays with a person at
// the computer, through `halonic trust` (HAL-16335).

import { realpath } from "node:fs/promises";
import {
  type CommandSearch,
  commandPaths,
  workspaceConnectorFiles,
} from "@halonicjs/adapter-doctor-node";
import { startsAProgram } from "@halonicjs/adapter-workspace-models";
import {
  type TrustCheck,
  TrustService,
  type TrustSubject,
  trustContentInputOf,
  trustSubjectOf,
} from "@halonicjs/app";
import type { Clock, TrustStore } from "@halonicjs/ports";
import {
  filesOf,
  type LoadedWorkspace,
  type LocalIntegrationInput,
  type RefusedKind,
  reachesOnlyTheTestModel,
} from "@halonicjs/workspace";
import { webCryptoDigest } from "./web-crypto-digest.ts";

/** A workspace's definitions and local integrations, both from one version. */
export interface WorkspaceAtVersion {
  readonly workspace: LoadedWorkspace;
  /** Each local integration, hashed as a runner start hashes it. */
  readonly integrations: readonly LocalIntegrationInput[];
}

/** The workspace folder a trust check is about. */
export interface TrustedFolder {
  /** The full path, for the file system. */
  readonly root: string;
  /** The folder as the user would type it, such as `./acme`, for the words. */
  readonly shown: string;
  /** The folder's own name, for a workspace without a name in `workspace.yaml`. */
  readonly name: string;
}

/** What reading trust needs on this computer, so tests can hand it a memory store. */
export interface TrustReadMachine {
  /** The trust records in the user's profile. Only read here. */
  readonly trustStore: TrustStore;
  readonly clock: Clock;
  /** Where the connectors' programs are looked for. */
  readonly commandSearch: CommandSearch;
}

/**
 * Whether starting things in the workspace needs no trust, because it can
 * only reach the built-in test model (Liam, HAL-1984): nothing outside
 * Halonic starts. `run`, `routines watch`, `runs send`, `serve` and the
 * serve trust gate all ask this one rule (HAL-12011), so they never
 * disagree about the same folder. It reads the definitions and local
 * integrations of the version that will be used, so a version that adds a
 * connector or a real provider turns the answer to `false`.
 *
 * @param version - the workspace and its integrations as they will be used
 * @param harness - the harness a run names for all its agents, such as
 *   `--harness codex`; it starts a program, so it always needs trust
 */
export function needsNoTrust(version: WorkspaceAtVersion, harness?: string): boolean {
  if (startsAProgram(harness)) return false;
  return reachesOnlyTheTestModel(trustContentInputOf(version.workspace, version.integrations));
}

/**
 * The workspace's name as a sentence names it: from `workspace.yaml`, or
 * the folder's own name when it has none, so a workspace run from inside
 * its folder is "acme", not "." (HAL-6810). Every sentence that names a loaded
 * workspace says it (the trust line, `run`, `runs`, `routines`), so one
 * workspace reads one way (HAL-4533, HAL-6610).
 *
 * @example
 * workspaceNameOf(loaded, { name: "acme", … }); // "Acme"
 * workspaceNameOf(unnamed, { name: "acme", … }); // "acme"
 */
export function workspaceNameOf(
  workspace: LoadedWorkspace,
  dir: Pick<TrustedFolder, "name">,
): string {
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
 * The trust subject of `version`, with each connector's program found on
 * this computer, for a trust check. A run passes the version it starts,
 * the live version's definitions and integrations, so trust is checked on
 * what runs, not on the saved files.
 *
 * @example
 * await readWorkspaceTrust(dir, nodeCommandSearch(), await savedVersionOf(dir));
 * // { name: "Acme", subject: { location: "/work/acme", connectors: [ … ], … } }
 */
export async function readWorkspaceTrust(
  dir: TrustedFolder,
  search: CommandSearch,
  version: WorkspaceAtVersion,
): Promise<WorkspaceTrust> {
  const { workspace } = version;
  const name = workspaceNameOf(workspace, dir);
  const connectorFiles = filesOf(workspace, "connector");
  const connectors = connectorFiles.map((file) => file.value);
  const subject = trustSubjectOf({
    workspace,
    integrations: version.integrations,
    location: await realpath(dir.root),
    commandPaths: await commandPaths(connectors, search),
    // From the folder, even for a version in the history: the programs run the files there.
    connectorFiles: await workspaceConnectorFiles(dir.root, dir.shown, connectors),
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

/** A file a trust check refused, workspace-relative, and why. */
export interface RefusedFile {
  readonly file: string;
  readonly reason: string;
}

/** Each file a check refused, workspace-relative, and why; empty when it refused nothing. */
export function refusedFilesOf(check: TrustCheck, workspace: WorkspaceTrust): RefusedFile[] {
  if (check.status !== "refused") {
    return [];
  }
  return check.refused.map(({ kind, id, reason }) => ({
    file: workspace.files.get(refusedFileKey(kind, id)) ?? id,
    reason,
  }));
}

/**
 * Where the workspace stands with trust on this computer: `not-needed` when
 * it reaches only the test model, else the trust record's answer.
 */
export type WorkspaceTrustState = "not-needed" | TrustCheck["status"] | "unreadable";

/** Where trust stands, and when the check `refused`, which files and why. */
export interface WorkspaceTrustAnswer {
  readonly state: WorkspaceTrustState;
  /** Each file the check refused and why, so a line can name them; empty unless `refused`. */
  readonly refused: readonly RefusedFile[];
}

/**
 * Where trust stands for the version `readVersion` reads in `dir`, by the
 * rule `run` and `routines watch` refuse by, without refusing: `serve`'s gate
 * and the `routines` list ask it (HAL-15525). Anything it can't read, the
 * version included, counts as `unreadable`, so a failure never reads as trust.
 */
export async function workspaceTrustState(
  dir: TrustedFolder,
  machine: TrustReadMachine,
  readVersion: () => Promise<WorkspaceAtVersion>,
): Promise<WorkspaceTrustAnswer> {
  try {
    const version = await readVersion();
    if (needsNoTrust(version)) {
      return { state: "not-needed", refused: [] };
    }
    const workspace = await readWorkspaceTrust(dir, machine.commandSearch, version);
    const check = await readOnlyCheck(machine, workspace.subject);
    return { state: check.status, refused: refusedFilesOf(check, workspace) };
  } catch {
    return { state: "unreadable", refused: [] };
  }
}

/**
 * The trust record's answer for `subject`, without writing anything: the
 * check is read-only, so a record that only lost connectors isn't shrunk
 * here, and the store it gets refuses every write, so no change to the
 * trust service can make this path grant (HAL-17049).
 */
async function readOnlyCheck(
  machine: TrustReadMachine,
  subject: TrustSubject,
): Promise<TrustCheck> {
  const service = new TrustService({
    store: readOnlyStore(machine.trustStore),
    digest: webCryptoDigest,
    clock: machine.clock,
    // Written only into a new record, and this path writes none.
    appVersion: "read-only",
  });
  return await service.check(subject, { readOnly: true });
}

/** `store` with every write refused. Methods are bound by hand: a class's aren't spread. */
function readOnlyStore(store: TrustStore): TrustStore {
  const refuse = () => Promise.reject(new Error("Reading trust never writes a trust record."));
  return {
    get: (location) => store.get(location),
    list: () => store.list(),
    grant: refuse,
    revoke: refuse,
  };
}
