import { connectorConfigOf } from "@halonicjs/app";
import {
  approveNamedTool,
  checkConnectorTools,
  type ListedToolApprovalCheck,
  type NamedToolApproval,
  reviewListedTools,
  revokeNamedTool,
} from "@halonicjs/app/listed-tools";
import { type Connector, needsApproval } from "@halonicjs/format";
import type {
  Clock,
  DefinitionSource,
  Digest,
  FolderReader,
  HttpClient,
  ListedToolFingerprint,
  Secrets,
  TokenStore,
  ToolApprovalStore,
} from "@halonicjs/ports";
import type { ListedToolsHost, ListedToolsSnapshot } from "@halonicjs/studio-feature-library/api";
import { listedToolsSnapshot } from "@halonicjs/studio-feature-library/api";
import {
  filesOf,
  harnessWorkingFolders,
  type LoadedWorkspace,
  loadWorkspace,
} from "@halonicjs/workspace";
import type { ToolLister } from "../connect/agent-host-tool-lister.ts";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";

type ListedToolPick = Parameters<ListedToolsHost["approve"]>[1][number];
type ListedToolsApproval = Awaited<ReturnType<ListedToolsHost["approve"]>>;

/** What {@link WorkspaceListedTools} reads and writes. */
export interface WorkspaceListedToolsOptions {
  /** The workspace's files, where its connectors are declared. */
  readonly definitions: DefinitionSource;
  /** The whole folder, for its real location and its agents' real working folders. */
  readonly folder: FolderReader;
  /** The folder's trust, checked on the files a start reads, before every start. */
  readonly trust: Pick<WorkspaceTrust, "checkLoaded">;
  /** Where approvals are kept: the profile's `tool-approvals`, which the CLI reads too. */
  readonly approvals: ToolApprovalStore;
  readonly digest: Digest;
  readonly clock: Clock;
  readonly secrets: Secrets;
  readonly tokens: TokenStore;
  readonly http: HttpClient;
  /** Starts a connector and reads its tools. */
  readonly listTools: ToolLister;
}

/** One connector of the workspace, from the single read that trust is checked on and that starts it. */
interface OpenedSource {
  readonly workspace: LoadedWorkspace;
  readonly connector: Connector;
  readonly location: string;
}

/**
 * The listed tools of one open workspace's connectors (requirement `studio.workspace-listed-tools`),
 * read the way `halonic tools review` reads them: the workspace must be trusted as it is now, or
 * nothing starts. Each call reads the files once, and trust is checked on that read, so what
 * starts is what was found trusted. The server is read again for every review and every approval, so a person
 * approves the version it lists now, never a remembered one. A rejected call says why, and the
 * review dialog shows it.
 *
 * @example
 * services.provide(ListedToolsHostService, new WorkspaceListedTools(options));
 */
export class WorkspaceListedTools implements ListedToolsHost {
  readonly #options: WorkspaceListedToolsOptions;
  readonly #listeners = new Set<() => void>();

  constructor(options: WorkspaceListedToolsOptions) {
    this.#options = options;
  }

  async review(connectorId: string): Promise<ListedToolsSnapshot> {
    const source = await this.#open(connectorId);
    const sourceName = source.connector.name ?? source.connector.id;
    if ("google" in source.connector.transport) {
      return nothingToReview(sourceName);
    }
    return listedToolsSnapshot(sourceName, reviewListedTools(await this.#check(source)), {
      workspaceName:
        filesOf(source.workspace, "workspace")[0]?.value.name ?? folderNameOf(source.location),
      asksBeforeUse: (toolName) => needsApproval(source.connector.tools, toolName),
    });
  }

  async approve(
    connectorId: string,
    picks: readonly ListedToolPick[],
  ): Promise<ListedToolsApproval> {
    const source = await this.#open(connectorId);
    if ("google" in source.connector.transport) {
      throw new Error("this connector's tools are built in, so there is nothing to approve");
    }
    const check = await this.#check(source);
    const approved: string[] = [];
    const changed: string[] = [];
    try {
      await this.#approveAll(check, picks, approved, changed);
    } finally {
      // Picks saved before a refusal still changed what is approved.
      if (approved.length > 0) this.#changed();
    }
    return { approved, changed };
  }

  async #approveAll(
    check: ListedToolApprovalCheck,
    picks: readonly ListedToolPick[],
    approved: string[],
    changed: string[],
  ): Promise<void> {
    for (const pick of picks) {
      const result = await approveNamedTool(
        check,
        pick.name,
        this.#options.approvals,
        this.#options.clock,
        pick.fingerprint as ListedToolFingerprint,
      );
      if (result.outcome === "changed") {
        changed.push(pick.name);
        continue;
      }
      if (result.outcome !== "approved" && result.outcome !== "already_approved") {
        const saved = approved.length > 0 ? ` (${approved.join(", ")} were approved first)` : "";
        throw new Error(refusalOf(pick.name, result) + saved);
      }
      approved.push(pick.name);
    }
  }

  async removeApproval(connectorId: string, toolName: string): Promise<void> {
    const { connector, location } = await this.#open(connectorId);
    await revokeNamedTool(this.#options.approvals, {
      location,
      source: connector.id,
      name: toolName,
    });
    this.#changed();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #changed(): void {
    for (const listener of this.#listeners) listener();
  }

  async #open(connectorId: string): Promise<OpenedSource> {
    const workspace = await loadWorkspace(this.#options.definitions);
    const connector = filesOf(workspace, "connector")
      .map((file) => file.value)
      .find((candidate) => candidate.id === connectorId);
    if (connector === undefined) {
      throw new Error(`this workspace has no connector "${connectorId}"`);
    }
    const location = await this.#options.folder.locationOf();
    if (location === null) throw new Error("the workspace folder has no location");
    return { workspace, connector, location };
  }

  /** Starts the connector and checks what it lists against the approvals, as a run would. */
  async #check({ workspace, connector, location }: OpenedSource): Promise<ListedToolApprovalCheck> {
    if ("http" in connector.transport) {
      throw new Error("Studio can't check the tools of an http server yet");
    }
    const trusted = await this.#options.trust.checkLoaded(workspace);
    if (trusted.status !== "trusted") {
      throw new Error("this workspace isn't trusted yet, so nothing was started");
    }
    const grant = trusted.grant;
    const listed = await this.#options.listTools(connectorConfigOf(connector), {
      secrets: this.#options.secrets,
      tokens: this.#options.tokens,
      http: this.#options.http,
      workspaceRoot: location,
      workingFolders: await this.#workingFolders(location, harnessWorkingFolders(workspace)),
      trust: grant,
    });
    const check = await checkConnectorTools({
      location,
      connector,
      listed,
      trust: grant,
      store: this.#options.approvals,
      digest: this.#options.digest,
      clock: this.#options.clock,
    });
    if (!check.ok) throw new Error(check.error);
    return check.value;
  }

  /** Each agent's folder as the shell resolves it, or under the real workspace path while it doesn't exist yet. */
  async #workingFolders(root: string, relative: readonly string[]): Promise<string[]> {
    const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
    return await Promise.all(
      relative.map(
        async (folder) =>
          (await this.#options.folder.locationOf(folder)) ??
          [root, ...folder.split("/")].join(separator),
      ),
    );
  }
}

/** The folder's own name, as the CLI names an unnamed workspace: the last part of its path. */
function folderNameOf(location: string): string {
  return (
    location
      .split(/[\\/]/)
      .filter((part) => part !== "")
      .at(-1) ?? location
  );
}

/** A connector whose tools are built in lists none, so there is nothing to approve. */
function nothingToReview(sourceName: string): ListedToolsSnapshot {
  return {
    sourceName,
    workspaceName: sourceName,
    toReview: [],
    keepsChanging: [],
    refused: [],
    approved: [],
    listingRefused: null,
    unreadable: null,
    hasApprovals: false,
  };
}

/** Why a pick couldn't be approved, for the dialog's "Couldn't approve the tools: …". */
function refusalOf(name: string, result: NamedToolApproval): string {
  switch (result.outcome) {
    case "refused":
      return `Halonic refused "${name}": ${result.reason}`;
    case "not_listed":
      return `the server doesn't list "${name}" any more`;
    case "unreadable":
      return "an approval of this server can't be read";
    default:
      return `"${name}" couldn't be approved`;
  }
}
