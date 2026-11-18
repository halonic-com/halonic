import type { DefinitionSource } from "@halonicjs/ports";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentChange,
  AgentHarnessId,
  AgentHub,
  AgentListing,
  AgentRef,
  AgentSettings,
  AgentsHost,
  AgentUser,
  HarnessReadiness,
  NewAgent,
} from "@halonicjs/studio-feature-agents/api";
import { filesOf, loadWorkspace, modelAliases } from "@halonicjs/workspace";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";

/** What {@link WorkspaceAgents} needs of the workspace's files. */
export interface WorkspaceAgentsParts {
  /** The kernel's `WorkspaceFiles`: reads with unsaved changes applied, and changes as one undo step. */
  readonly files: {
    read(path: string): Promise<string | null>;
    list(dir: string): Promise<string[]>;
    change(
      label: string,
      changes: Record<string, string | null>,
      options?: { coalesceKey?: string },
    ): void;
  };
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /**
   * Asks the agent host whether a harness can run for this agent. Absent where there is no agent
   * host (the browser), which answers "couldn't check".
   */
  readonly detectHarness?: (ref: AgentRef, harness: AgentHarnessId) => Promise<HarnessReadiness>;
}

/** Where the agent files of a hub are kept. */
const agentFolder = (hubId: string): string => `hubs/${hubId}/agents`;

/** The workspace's model aliases, which every hub can use. */
const modelsFile = "models.yaml";

const agentSuffix = ".agent.yaml";

/** The text of a new agent: its id, its name and, when the person wrote any, its instructions. */
function newAgentText(id: string, name: string, instructions: string): string {
  return [
    `id: ${id}`,
    // A JSON string is a YAML double-quoted one, so any text a person types is safe.
    `name: ${JSON.stringify(name)}`,
    ...(instructions === "" ? [] : [`instructions: ${JSON.stringify(instructions)}`]),
    "",
  ].join("\n");
}

/**
 * The Agents feature's host (`agents.host`), over the workspace's files: the list reads the files
 * with their unsaved changes, so a new agent shows at once, and a new agent is one undoable change
 * that saves itself like any other.
 *
 * @example
 * services.provide(AgentsHostService, new WorkspaceAgents({ files, onChange }));
 */
export class WorkspaceAgents implements AgentsHost {
  readonly #parts: WorkspaceAgentsParts;
  #hubs: readonly AgentHub[] = [];
  /** The names of the agents read or made so far, by hub and id, for {@link WorkspaceAgents.nameOf}. */
  readonly #names = new Map<string, string>();

  constructor(parts: WorkspaceAgentsParts) {
    this.#parts = parts;
  }

  /** The hubs the last load found; none before the first one. */
  hubs(): readonly AgentHub[] {
    return this.#hubs;
  }

  nameOf({ hubId, id }: AgentRef): string | undefined {
    return this.#names.get(`${hubId}/${id}`);
  }

  async list(): Promise<readonly AgentListing[]> {
    const workspace = await this.#load();
    const listings = filesOf(workspace, "agent").flatMap((file) =>
      file.hub === null ? [] : [listingOf(file.hub, file.value)],
    );
    for (const { hubId, id, name } of listings) this.#names.set(`${hubId}/${id}`, name);
    return listings;
  }

  /** Reads one agent from its file, with unsaved changes applied; throws `not_found` when the hub has no such agent. */
  async read({ hubId, id }: AgentRef): Promise<AgentListing> {
    const workspace = await this.#load();
    const file = filesOf(workspace, "agent").find(
      (one) => one.hub === hubId && one.value.id === id,
    );
    if (file === undefined) throw agentGone();
    const listing = listingOf(hubId, file.value);
    this.#names.set(`${hubId}/${id}`, listing.name);
    return listing;
  }

  /** One agent's settings, from its file with unsaved changes applied; throws `not_found` when it isn't there. */
  async settings(ref: AgentRef): Promise<AgentSettings> {
    const { agent } = await this.#find(ref);
    return {
      ...listingOf(ref.hubId, agent),
      instructions: agent.instructions,
      maxSteps: agent.maxSteps,
      harness: agent.harness ?? "halonic",
    };
  }

  /** Whether `harness` can run for this agent; `halonic` always can, and a check that didn't work says so. */
  async harnessReadiness(ref: AgentRef, harness: AgentHarnessId): Promise<HarnessReadiness> {
    await this.#find(ref);
    if (harness === "halonic") return { status: "ready", version: "" };
    const detect = this.#parts.detectHarness;
    if (detect === undefined) {
      return {
        status: "failed",
        error: "Halonic can't check programs on this computer from here.",
      };
    }
    try {
      return await detect(ref, harness);
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Edits the agent's file in place, so comments and the order of its keys stay, as one undoable
   * change. Typing in one field coalesces into one step.
   */
  async update(ref: AgentRef, change: AgentChange): Promise<void> {
    if (change.name !== undefined && change.name.trim() === "") {
      throw new KindedError("invalid_input", "An agent needs a name.");
    }
    if (
      change.maxSteps !== undefined &&
      !(Number.isInteger(change.maxSteps) && change.maxSteps >= 1 && change.maxSteps <= 200)
    ) {
      throw new KindedError("invalid_input", "The turn limit is a whole number from 1 to 200.");
    }
    const { path } = await this.#find(ref);
    const text = await this.#parts.files.read(path);
    if (text === null) throw agentGone();
    const edits: YamlEdit[] = [];
    for (const field of [
      "name",
      "description",
      "instructions",
      "model",
      "maxSteps",
      "harness",
    ] as const) {
      const value = change[field];
      if (value !== undefined) edits.push({ kind: "set", path: [field], value });
    }
    const edited = editYaml(text, edits);
    if (!edited.ok) {
      throw new KindedError(
        "invalid_input",
        "This agent's file couldn't be changed as it is written.",
      );
    }
    const fields = edits.map((edit) => edit.path[0]).join(",");
    this.#parts.files.change(
      `Changed agent ${change.name ?? ref.id}`,
      { [path]: edited.value.text },
      { coalesceKey: `agent:${path}:${fields}` },
    );
    if (change.name !== undefined) this.#names.set(`${ref.hubId}/${ref.id}`, change.name);
  }

  /** The aliases of `models.yaml` and of the agent's hub; throws `not_found` when the agent isn't there. */
  async modelAliases(ref: AgentRef): Promise<readonly string[]> {
    await this.#find(ref);
    return [...modelAliases(await this.#load(), ref.hubId).keys()];
  }

  async #find({ hubId, id }: AgentRef) {
    const workspace = await this.#load();
    const file = filesOf(workspace, "agent").find(
      (one) => one.hub === hubId && one.value.id === id,
    );
    if (file === undefined) throw agentGone();
    return { agent: file.value, path: file.path };
  }

  /** The workflows of the agent's hub that run it in a step; throws `not_found` when the agent isn't there. */
  async referencesTo({ hubId, id }: AgentRef): Promise<readonly AgentUser[]> {
    const workspace = await this.#load();
    if (!filesOf(workspace, "agent").some((one) => one.hub === hubId && one.value.id === id)) {
      throw agentGone();
    }
    return filesOf(workspace, "workflow")
      .filter(
        (file) =>
          file.hub === hubId &&
          Object.values(file.value.states).some((state) => state.agent === id),
      )
      .map((file) => ({ hubId, id: file.value.id, name: file.value.name }));
  }

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }

  /** Creates the agent in `hubId`; throws `not_found` when the workspace has no such hub, so no stray folder is made. */
  async create({ name, hubId, instructions = "" }: NewAgent): Promise<AgentRef> {
    await this.#load();
    if (!this.#hubs.some((hub) => hub.id === hubId)) {
      throw new KindedError("not_found", `The workspace has no hub "${hubId}".`);
    }
    const folder = agentFolder(hubId);
    const taken = (await this.#parts.files.list(folder))
      .filter((path) => path.startsWith(`${folder}/`) && path.endsWith(agentSuffix))
      .map((path) => path.slice(folder.length + 1, -agentSuffix.length))
      .filter((id) => !id.includes("/"));
    const id = uniqueName(slugify(name), taken);
    this.#parts.files.change(`Created agent ${name}`, {
      [`${folder}/${id}${agentSuffix}`]: newAgentText(id, name, instructions),
    });
    this.#names.set(`${hubId}/${id}`, name);
    return { hubId, id };
  }

  /** Loads the workspace from its files as they are now, and keeps its hubs for {@link WorkspaceAgents.hubs}. */
  async #load() {
    const workspace = await loadWorkspace(this.#source());
    this.#hubs = filesOf(workspace, "hub").map((file) => ({
      id: file.value.id,
      name: file.value.name,
    }));
    return workspace;
  }

  /** The workspace's hubs and its `models.yaml` as files, with unsaved changes applied. */
  #source(): DefinitionSource {
    const { files } = this.#parts;
    return {
      location: "workspace:unsaved",
      list: async () => [
        ...(await files.list("hubs")),
        ...((await files.read(modelsFile)) === null ? [] : [modelsFile]),
      ],
      read: (path) => files.read(path),
      version: async () => "unsaved",
    };
  }
}

/** What a row of the list shows of an agent's file. */
function listingOf(
  hubId: string,
  agent: { id: string; name: string; description?: string | undefined; model?: string | undefined },
): AgentListing {
  return {
    hubId,
    id: agent.id,
    name: agent.name,
    description: agent.description,
    model: agent.model,
  };
}

/** What a read of an agent the workspace doesn't have rejects with: Studio shows the item-gone state for it. */
function agentGone(): KindedError {
  return new KindedError("not_found", "This agent isn't in this workspace any more.");
}
