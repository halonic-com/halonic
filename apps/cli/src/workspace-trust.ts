// What the trust check covers in a workspace, read the one way every command
// that checks trust reads it (`doctor`, `trust`, and `run` when it lands), so
// they all compute one fingerprint for the same files on the same computer.

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
import type { Clock, KeyOrigins, TrustGrant, TrustStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import {
  filesOf,
  type LoadedWorkspace,
  type RefusedKind,
  reachesOnlyTheTestModel,
} from "@halonicjs/workspace";
import { keyAddressLists } from "./key-address-lists.ts";
import type { Message } from "./messages/define.ts";
import { plainText } from "./messages/phrase.ts";
import { runMessages } from "./messages/run.ts";
import { type RefusedFile, trustMessages } from "./messages/trust.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { printable } from "./output/printable.ts";
import { trustChangesDocument } from "./output/trust-changes-json.ts";
import { type FingerprintedCheck, trustCheckLines } from "./output/trust-check.ts";
import type { PluginHosts } from "./sheet-hosts.ts";
import { halonicVersion } from "./version.ts";
import type { WorkspaceAtVersion } from "./workspace-at-version.ts";
import type { OpenWorkspaceDir, WorkspaceDir } from "./workspace-dir.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

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
  dir: OpenWorkspaceDir,
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

/** Each file a check refused, workspace-relative, and why; empty when it refused nothing. */
function refusedFilesOf(check: TrustCheck, workspace: WorkspaceTrust): RefusedFile[] {
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
  dir: OpenWorkspaceDir,
  machine: WorkspaceTrustMachine,
  readVersion: () => Promise<WorkspaceAtVersion>,
): Promise<WorkspaceTrustAnswer> {
  try {
    const version = await readVersion();
    if (needsNoTrust(version)) {
      return { state: "not-needed", refused: [] };
    }
    const workspace = await readWorkspaceTrust(dir, machine.commandSearch, version);
    const check = await cliTrustService(machine.trustStore, machine.clock).check(workspace.subject);
    return { state: check.status, refused: refusedFilesOf(check, workspace) };
  } catch {
    return { state: "unreadable", refused: [] };
  }
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
