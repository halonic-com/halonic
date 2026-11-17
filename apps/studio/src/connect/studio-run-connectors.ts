import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ConnectorFactories } from "@halonicjs/app";
import { FolderRunConnectors, type RunProgramFolders } from "@halonicjs/engine";
import {
  type DefinitionSource,
  type FolderReader,
  type HttpClient,
  type Secrets,
  type TokenStore,
  workspaceSecrets,
} from "@halonicjs/ports";
import { definitionsOf, harnessWorkingFolders, loadWorkspace } from "@halonicjs/workspace";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { agentHostConnectorFactory } from "./agent-host-tool-lister.ts";

/** What the window's runs start their connectors with. */
export interface StudioRunConnectorsInput {
  readonly transport: AgentHostTransport;
  /** The workspace's files, where a run's hub finds its connectors. */
  readonly definitions: DefinitionSource;
  /** The whole folder, for its real location and its agents' real working folders. */
  readonly folder: FolderReader;
  /** Only read: the grant a connector starts with comes from the check a person already saved. */
  readonly trust: Pick<WorkspaceTrust, "checkLoaded">;
  readonly secrets: Secrets;
  readonly tokens: TokenStore;
  readonly http: HttpClient;
  /** Hears what couldn't be closed when a run's connectors end. */
  reportError(error: unknown): void;
}

/**
 * The connectors of the runs in the window, started the way the Library's listing starts them
 * (`agentHostConnectorFactory`) and the way the CLI's runs do (`FolderRunConnectors`). Hand it to
 * the executor as `runs.runConnectors`, and `closeAll()` it once the executor has closed.
 *
 * A run reads the workspace as saved, and its programs start in the workspace folder: the page
 * can't make a copy at the run's commit as the CLI does. The workspace must be trusted as it is
 * when the run needs a connector. Without a grant the connector is created without one, and the
 * agent host refuses to start its program, as the CLI's `stdio` factory does. A person is never
 * asked here: trust is granted on the workspace's own page.
 *
 * @example
 * const connectors = studioRunConnectors(input);
 * new LocalExecutor({ …, runs: { …, runConnectors: connectors } });
 */
export function studioRunConnectors(input: StudioRunConnectorsInput): FolderRunConnectors {
  return new FolderRunConnectors({
    factories: new ConnectorFactories([agentHostConnectorFactory(input.transport)]),
    programFolders: workspaceFolder(input.folder),
    // A workspace names the secrets its connectors get, so never Halonic's own or a plugin's.
    context: { secrets: workspaceSecrets(input.secrets), tokens: input.tokens, http: input.http },
    versionOf: async (run) => {
      const workspace = await loadWorkspace(input.definitions);
      const checked = await input.trust.checkLoaded(workspace);
      return {
        connectors: Object.values(definitionsOf(workspace, run.hubId).connectors),
        trust: checked.status === "trusted" ? checked.grant : null,
        workingFoldersOf: (root) =>
          resolveWorkingFolders(input.folder, root, harnessWorkingFolders(workspace)),
      };
    },
    // The page keeps nothing per run beyond the connectors themselves.
    runEnded: () => undefined,
    reportError: input.reportError,
  });
}

/**
 * Each agent's folder as the shell resolves it, or under the real workspace path while it doesn't
 * exist yet. Shared by the review of listed tools and the runs, so both refuse a program that
 * starts from an agent's folder.
 */
export async function resolveWorkingFolders(
  folder: Pick<FolderReader, "locationOf">,
  root: string,
  relative: readonly string[],
): Promise<string[]> {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return await Promise.all(
    relative.map(
      async (each) => (await folder.locationOf(each)) ?? [root, ...each.split("/")].join(separator),
    ),
  );
}

/** The workspace folder as the place programs start in; there is no copy to make or to release. */
function workspaceFolder(folder: Pick<FolderReader, "locationOf">): RunProgramFolders {
  return {
    folderFor: async () => {
      const path = await folder.locationOf();
      if (path === null) throw new Error("the workspace folder has no location");
      return { path, release: async () => undefined };
    },
  };
}
