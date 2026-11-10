// What the trust check covers in a workspace, read the one way every command
// that checks trust reads it (`doctor`, `trust`, and `run` when it lands), so
// they all compute one fingerprint for the same files on the same computer.

import { realpath } from "node:fs/promises";
import { TrustService, type TrustSubject } from "@halonicjs/app";
import type { Clock, TrustStore } from "@halonicjs/ports";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { type CommandSearch, commandPaths } from "./command-paths.ts";
import { halonicVersion } from "./version.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { webCryptoDigest } from "./workspace-runs.ts";

/** What {@link trustSubjectOf} reads. */
export interface TrustSubjectInput {
  /** The workspace, loaded. Files with an error are left out, as `loadWorkspace` does. */
  readonly workspace: LoadedWorkspace;
  /** The workspace's resolved real path: the trust record's key. */
  readonly location: string;
  /** The absolute path each connector's command resolves to on this computer. */
  readonly commandPaths: ReadonlyMap<string, string>;
}

/**
 * Every connector and agent of the workspace, of the root and of every hub,
 * as the trust check fingerprints them.
 */
export function trustSubjectOf(input: TrustSubjectInput): TrustSubject {
  const { workspace } = input;
  return {
    location: input.location,
    connectors: filesOf(workspace, "connector").map((file) => file.value),
    commandPaths: input.commandPaths,
    agents: filesOf(workspace, "agent").map((file) => file.value),
    // A workspace doesn't load its local integrations yet; when it does,
    // they go here with their settings, so every command checks the same
    // fingerprint.
    integrations: [],
  };
}

/** A workspace as a trust check is about it. */
export interface WorkspaceTrust {
  /** The workspace's name from `workspace.yaml`, or the folder as typed when it has none. */
  readonly name: string;
  readonly subject: TrustSubject;
}

/**
 * Loads the workspace in `dir` and finds each connector's program on this
 * computer, for a trust check.
 *
 * @example
 * await readWorkspaceTrust(await openWorkspaceDir(input, io), nodeCommandSearch());
 * // { name: "Acme", subject: { location: "/work/acme", connectors: [ … ], … } }
 */
export async function readWorkspaceTrust(
  dir: OpenWorkspaceDir,
  search: CommandSearch,
): Promise<WorkspaceTrust> {
  const workspace = await loadWorkspace(dir.store);
  const name = filesOf(workspace, "workspace")[0]?.value.name ?? dir.shown;
  const connectors = filesOf(workspace, "connector").map((file) => file.value);
  const subject = trustSubjectOf({
    workspace,
    location: await realpath(dir.root),
    commandPaths: await commandPaths(connectors, search),
  });
  return { name, subject };
}

/** The trust service over `store`, with the CLI's digest and version. */
export function cliTrustService(store: TrustStore, clock: Clock): TrustService {
  return new TrustService({ store, digest: webCryptoDigest, clock, appVersion: halonicVersion });
}
