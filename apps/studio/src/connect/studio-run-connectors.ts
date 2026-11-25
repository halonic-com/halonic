import {
  AgentHostProgramCopies,
  type AgentHostTransport,
} from "@halonicjs/adapter-agent-host-client";
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
import type { SheetHosts } from "@halonicjs/format";
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
import type { RunVersionLoads } from "../engine/page-run-versions.ts";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { agentHostConnectorFactory } from "./agent-host-tool-lister.ts";

/** The sheet hosts of a page's run: none, since the page starts no runner connector. */
const NO_SHEET_HOSTS: SheetHosts = { plugins: new Map(), integrations: new Map() };

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
  /**
   * The version each run read, which its connectors' files come from, forgotten when the run
   * ends. Left out, every run's connectors come from the files as saved now, and a run of the
   * live version starts none.
   */
  readonly versions?: RunVersionLoads;
  /** Hears what couldn't be closed when a run's connectors end. */
  reportError(error: unknown): void;
}

/**
 * The connectors of the runs in the window, started the way the Library's listing starts them
 * (`agentHostConnectorFactory`) and the way the CLI's runs do (`FolderRunConnectors`). Hand it to
 * the executor as `runs.runConnectors`, and `closeAll()` it once the executor has closed.
 *
 * A run's connectors come from the version it read (`versions`), checked for trust on that
 * read, so the trust covers that version's connector files and their commands. Their programs
 * start in the workspace folder for a run of the saved files, and for a run of the live version
 * in the agent host's copy of the workspace at its commit, as the CLI's do (HAL-16260), released
 * once the run's connectors have closed. Without a grant
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
    programFolders: programFoldersOf(input),
    // A workspace names the secrets its connectors get, so never Halonic's own or a plugin's.
    context: { secrets: workspaceSecrets(input.secrets), tokens: input.tokens, http: input.http },
    // The version the run read; without `versions`, the files as they are now, not as the engine
    // opened on, so a connector saved since then starts under its new file's program but the old
    // file's `tools` lists. Safe, because trust is checked on this read.
    versionOf: async (run) => {
      const workspace =
        input.versions === undefined
          ? await loadWorkspace(input.definitions)
          : (await input.versions.loadedOf(run)).workspace;
      const checked = await input.trust.checkLoaded(workspace);
      const workingFolders = harnessWorkingFolders(workspace);
      return {
        connectors: Object.values(definitionsOf(workspace, run.hubId).connectors),
        trust: checked.status === "trusted" ? checked.grant : null,
        // In a copy, under the copy: the shell resolves only the workspace folder's own paths.
        workingFoldersOf: async (root) =>
          run.version.reads === "saved-files"
            ? await resolveWorkingFolders(input.folder, root, workingFolders)
            : workingFolders.map((each) => joinedUnder(root, each)),
        // The agent host starts only `stdio` connectors, never a plugin's backend or a local
        // integration, so the page lists no sheet hosts: such a connector isn't local here
        // (`workspace.local-only-sheet-hosts`).
        sheetHostsOf: async () => NO_SHEET_HOSTS,
      };
    },
    runEnded: (runId) => input.versions?.forget(runId),
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
 * is given once for each connector and set of tools. Every report goes to `record` too, the
 * Library's refusals list, which keeps the current set.
 *
 * @example
 * const reportWaiting = libraryWaitingReporter((line) => console.warn(line), refusals.recordWaitingOf);
 */
export function libraryWaitingReporter(
  warn: (line: string) => void,
  record: (connector: string, waiting: readonly ChatTurnWaiting[]) => void = () => undefined,
): (connector: string, waiting: readonly ChatTurnWaiting[]) => void {
  const told = new Set<string>();
  return (connector, waiting) => {
    record(connector, waiting);
    const names = waiting.map((tool) => tool.name).join(", ");
    const key = `${connector}\n${names}`;
    if (told.has(key)) return;
    told.add(key);
    warn(
      waiting.length === 1
        ? `The tool ${names} of the connector "${connector}" is off until you review it. To review it, open the connector in the Library.`
        : `The tools ${names} of the connector "${connector}" are off until you review them. To review them, open the connector in the Library.`,
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
  return await Promise.all(
    relative.map(async (each) => (await folder.locationOf(each)) ?? joinedUnder(root, each)),
  );
}

/** `relative`, a workspace path, under `root`, with the separator `root` uses. */
function joinedUnder(root: string, relative: string): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return [root, ...relative.split("/")].join(separator);
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
    reason: `sending is off for the connector "${connector}", and Studio can't switch it on yet.`,
  }),
};

/**
 * Where a run's programs start: the workspace folder for a run of the saved files, with nothing to
 * release, and the agent host's copy of the workspace at its commit for a run of the live version,
 * never the workspace folder in its place. Without `versions`, a run of the live version is
 * refused, as the CLI's program folders refuse it.
 */
function programFoldersOf(
  input: Pick<StudioRunConnectorsInput, "transport" | "folder" | "versions" | "reportError">,
): RunProgramFolders {
  return {
    folderFor: async (version) => {
      if (version.reads !== "saved-files" && input.versions === undefined) {
        throw new ProgramCopyUnavailableError(
          version.commit,
          new Error("Studio runs only the saved files, so it makes no copy at a commit."),
        );
      }
      const path = await workspaceLocation(input.folder);
      if (version.reads === "saved-files") return { path, release: async () => undefined };
      return await new AgentHostProgramCopies(input.transport, path, input.reportError).open(
        version.commit,
      );
    },
  };
}

/**
 * Stops the workspace's connectors in the agent host and removes the program copies an engine that
 * stopped left there, as the CLI's engine does when it opens. Call it once the engine lock is
 * held, before any run starts. It never throws: an error goes to `reportError`, and the next
 * engine tries again.
 *
 * @example
 * await startProgramCopies({ transport, folder, reportError });
 */
export async function startProgramCopies(
  input: Pick<StudioRunConnectorsInput, "transport" | "folder" | "reportError">,
): Promise<void> {
  try {
    const path = await workspaceLocation(input.folder);
    await new AgentHostProgramCopies(input.transport, path, input.reportError).start();
  } catch (error) {
    input.reportError(error);
  }
}

async function workspaceLocation(folder: Pick<FolderReader, "locationOf">): Promise<string> {
  const path = await folder.locationOf();
  if (path === null) throw new Error("the workspace folder has no location");
  return path;
}
