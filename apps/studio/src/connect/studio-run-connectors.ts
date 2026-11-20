import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import {
  ConnectorFactories,
  ProgramCopyUnavailableError,
  type SendingSettings,
} from "@halonicjs/app";
import { connectorToolServer } from "@halonicjs/app/listed-tools";
import {
  type ConnectorToolAddress,
  FolderRunConnectors,
  type ListedToolApprovalStore,
  type LocalExecutorOptions,
  type RunProgramFolders,
} from "@halonicjs/engine";
import {
  type ChatTurnWaiting,
  type Clock,
  type DefinitionSource,
  type Digest,
  type FolderReader,
  type HttpClient,
  type Secrets,
  type TokenStore,
  type ToolApprovalStore,
  workspaceSecrets,
} from "@halonicjs/ports";
import { definitionsOf, filesOf, harnessWorkingFolders, loadWorkspace } from "@halonicjs/workspace";
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
 * can't make a copy at the run's commit as the CLI does, so a run of the live version starts
 * none. The workspace must be trusted as it is when the run needs a connector. Without a grant
 * the connector is created without one, and the agent host refuses to start its program, as the
 * CLI's `stdio` factory does. A person is never asked here: trust is granted on the workspace's
 * own page.
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
    // The files as they are now, not as the engine opened on, so a connector saved since then
    // starts under its new file's program but the old file's `tools` lists. Safe, because trust
    // is checked on this read; the CLI has the same gap for a run of the saved files.
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

/** What {@link studioListedToolApproval} reads. */
export interface StudioListedToolApprovalInput {
  /** The workspace's files, for the connectors' files as they are now. */
  readonly definitions: DefinitionSource;
  /** The whole folder, for its real location: the approvals' key. */
  readonly folder: Pick<FolderReader, "locationOf">;
  /** The approvals the Library writes, the profile's `tool-approvals` the CLI reads too. */
  readonly approvals: ToolApprovalStore;
  readonly digest: Digest;
  readonly clock: Clock;
  /** Hears the listed tools that wait for an approval in the Library. */
  reportWaiting(connector: string, waiting: readonly ChatTurnWaiting[]): void;
}

/**
 * The runs' approval check of listed tools, against what a person approved in the Library. The
 * key and the address are the ones the Library approves at (`WorkspaceListedTools`): the folder's
 * real location, and the connector's server with no pin, since Studio starts none with one.
 *
 * @throws Error when the workspace folder has no location
 *
 * @example
 * const listedToolApproval = await studioListedToolApproval({ definitions, folder, approvals, digest, clock, reportWaiting });
 */
export async function studioListedToolApproval(
  input: StudioListedToolApprovalInput,
): Promise<ListedToolApprovalStore> {
  const location = await input.folder.locationOf();
  if (location === null) throw new Error("the workspace folder has no location");
  return {
    kind: "store",
    location,
    store: input.approvals,
    digest: input.digest,
    clock: input.clock,
    addressOf: (connector) => addressOf(input.definitions, connector, input.digest),
    reportWaiting: input.reportWaiting,
  };
}

/**
 * A run's `reportWaiting`: a warning naming the Library, where the tools a turn left out are
 * approved, as the CLI's names `halonic tools review`. A run asks at every step, so each warning
 * is given once for each connector and set of tools.
 *
 * @example
 * const reportWaiting = libraryWaitingReporter((line) => console.warn(line));
 */
export function libraryWaitingReporter(
  warn: (line: string) => void,
): (connector: string, waiting: readonly ChatTurnWaiting[]) => void {
  const told = new Set<string>();
  return (connector, waiting) => {
    const names = waiting.map((tool) => tool.name).join(", ");
    const key = `${connector}\n${names}`;
    if (told.has(key)) return;
    told.add(key);
    warn(
      `The tools ${names} of the connector "${connector}" wait for your approval and stay off. To approve them, review the connector's tools in the Library.`,
    );
  };
}

/**
 * Where a connector's tools are approved, as `cliListedToolApproval` takes it. Only an `http` or
 * `stdio` connector lists tools a server wrote; the others' tools are ones Halonic reviewed.
 */
async function addressOf(
  definitions: DefinitionSource,
  connectorId: string,
  digest: Digest,
): Promise<ConnectorToolAddress> {
  const connector = filesOf(await loadWorkspace(definitions), "connector")
    .map((file) => file.value)
    .find((candidate) => candidate.id === connectorId);
  if (connector === undefined) {
    return { kind: "unaddressable", reason: "the workspace has no file for this connector" };
  }
  if (!("http" in connector.transport) && !("stdio" in connector.transport)) {
    return { kind: "reviewed" };
  }
  const server = await connectorToolServer(connector, undefined, digest);
  return server.ok
    ? { kind: "listed", server: server.value }
    : { kind: "unaddressable", reason: server.error };
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

/** What a run's connector call checks at the engine's side-effect boundary. */
export type RunConnectorCalls = NonNullable<
  NonNullable<LocalExecutorOptions["runs"]>["connectorCalls"]
>;

/**
 * What a run's connector call checks in the window: sending is off, as Studio keeps no connector
 * settings yet, so only tools labelled `send` are refused, as in the CLI.
 */
export function studioConnectorCalls(
  location: string,
  reportError: (error: unknown) => void,
): RunConnectorCalls {
  return {
    location,
    sending: sendingOff,
    reportSettingsError: (connector, error) => {
      reportError(
        new Error(`The sending settings of the connector "${connector}" couldn't be read.`, {
          cause: error,
        }),
      );
    },
  };
}

const sendingOff: SendingSettings = {
  checkSending: async ({ connector }) => ({
    allowed: false,
    reason: `sending is off for the connector "${connector}": Studio can't switch it on yet`,
  }),
};

/**
 * The workspace folder as the place programs start in; there is no copy to make or to release.
 * A run of the live version is refused, never started in the saved files in its place, as the
 * CLI's program folders refuse it.
 */
function workspaceFolder(folder: Pick<FolderReader, "locationOf">): RunProgramFolders {
  return {
    folderFor: async (version) => {
      if (version.reads !== "saved-files") {
        throw new ProgramCopyUnavailableError(
          version.commit,
          new Error("Studio runs only the saved files, so it makes no copy at a commit."),
        );
      }
      const path = await folder.locationOf();
      if (path === null) throw new Error("the workspace folder has no location");
      return { path, release: async () => undefined };
    },
  };
}
