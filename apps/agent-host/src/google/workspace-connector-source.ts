import { realpath } from "node:fs/promises";
import { FileSystemFolderReader, FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { readLocalIntegrations } from "@halonicjs/app";
import { googleSetupSubject, type SetupRecords } from "@halonicjs/google-setup";
import type { GoogleSetupSource } from "@halonicjs/host-server";
import type { Digest } from "@halonicjs/ports";
import { type ProfileFolder, workspaceFolders } from "@halonicjs/profile";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

/** What the source finds a setup's connector with. */
export interface WorkspaceConnectorSourceOptions {
  /** The setup records: each names the workspace and the connector it is linked to. */
  setups: SetupRecords;
  /** The profile the workspace keys are made under. */
  profile: ProfileFolder;
  /** The folders the launcher named as workspaces. */
  workspaceRoots: readonly string[];
  digest: Digest;
}

/**
 * Tells who a Google sign-in must confirm by reading the connector the
 * setup's record is linked to, in the workspace the record names. The page
 * never says it, so a request can't name the address Google must accept.
 * Answers `null` when no served workspace holds the record's connector, or
 * the connector isn't a Google one.
 */
export function workspaceConnectorSource(
  options: WorkspaceConnectorSourceOptions,
): GoogleSetupSource {
  return {
    describe: async (accountRef) => {
      const record = await options.setups.read(accountRef);
      const root =
        record === null ? undefined : await rootOfWorkspace(options, record.connector.workspace);
      if (record === null || root === undefined) {
        return null;
      }
      const workspace = await loadWorkspace(new FolderDefinitionStore(root, root));
      const subject = googleSetupSubject(
        filesOf(workspace, "connector").map((file) => file.value),
        await readLocalIntegrations(new FileSystemFolderReader(root, root), options.digest),
        record.connector.id,
      );
      if (subject.kind !== "found") {
        return null;
      }
      return { account: subject.address, services: subject.services };
    },
  };
}

/** The served workspace folder whose key in the profile is `key`, or `undefined`. */
async function rootOfWorkspace(
  options: WorkspaceConnectorSourceOptions,
  key: string,
): Promise<string | undefined> {
  for (const root of options.workspaceRoots) {
    const location = await realpath(root).catch(() => undefined);
    if (location === undefined) {
      continue;
    }
    const folders = await workspaceFolders(options.profile, location, options.digest);
    if (folders.key === key) {
      return location;
    }
  }
  return undefined;
}
