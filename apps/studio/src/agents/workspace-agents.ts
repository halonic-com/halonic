import { type ChatAnswer, type ChatAnswerRequest, maxTurnLimit } from "@halonicjs/app";
import type { DefinitionSource } from "@halonicjs/ports";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentChange,
  AgentChatRequest,
  AgentHarnessId,
  AgentHub,
  AgentListing,
  AgentRef,
  AgentSettings,
  AgentsHost,
  AgentToolList,
  AgentToolOption,
  AgentUser,
  HarnessReadiness,
  NewAgent,
  TrashedAgent,
} from "@halonicjs/studio-feature-agents/api";
import {
  filesOf,
  loadWorkspace,
  modelAliases,
  resolveModel,
  settingsPath,
} from "@halonicjs/workspace";
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
    /** The kernel's `WorkspaceFiles.undo`: `false` when there was nothing to undo. */
    undo(): boolean;
    /** The kernel's `WorkspaceFiles.step`: moves on every change, so it tells a step is still the newest. */
    readonly step: number;
  };
  /** Calls `listener` after every change of the workspace's files; returns the way to stop. */
  readonly onChange: (listener: () => void) => () => void;
  /**
   * Asks the agent host whether a harness can run for this agent. Absent where there is no agent
   * host (the browser), which answers "couldn't check".
   */
  readonly detectHarness?: (ref: AgentRef, harness: AgentHarnessId) => Promise<HarnessReadiness>;
  /**
   * Answers a chat on the workspace's engine: `ChatService.answer` on the engine's executor,
   * which opens the engine on first use. Absent where there is no engine, which answers
   * "The engine isn't answering."
   */
  readonly answerChat?: (request: ChatAnswerRequest) => Promise<ChatAnswer>;
}

/** Where the agent files of a hub are kept. */
const agentFolder = (hubId: string): string => `hubs/${hubId}/agents`;

/** Where the workspace keeps the skills, knowledge and connectors its hubs share. */
const sharedLibraryFolder = "library";

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
      skills: agent.skills,
      knowledge: agent.knowledge,
      connectors: agent.connectors,
    };
  }

  /**
   * The skills, knowledge and connectors the agent's hub can use: its own, then the shared ones,
   * only those its `uses` lists when it has one (as the workspace check allows).
   */
  async toolOptions(
    ref: AgentRef,
  ): Promise<Readonly<Record<AgentToolList, readonly AgentToolOption[]>>> {
    await this.#find(ref);
    const workspace = await this.#load();
    const uses = filesOf(workspace, "hub").find((file) => file.hub === ref.hubId)?.value.uses;
    const optionsOf = (list: AgentToolList, kind: "skill" | "knowledge" | "connector") => {
      const items = filesOf(workspace, kind);
      const own = items.filter((item) => item.hub === ref.hubId);
      const shared = items.filter(
        (item) => item.hub === null && (uses === undefined || uses[list].includes(item.value.id)),
      );
      return [...own, ...shared].map((item) => ({
        id: item.value.id,
        name: item.value.name ?? item.value.id,
      }));
    };
    return {
      skills: optionsOf("skills", "skill"),
      knowledge: optionsOf("knowledge", "knowledge"),
      connectors: optionsOf("connectors", "connector"),
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
   * Answers a Try it message on the engine. The engine reads the agent by its id, so the answer
   * uses the agent as it's saved, with its own tools; the chat adds none of its own.
   */
  async answer(ref: AgentRef, request: AgentChatRequest): Promise<ChatAnswer> {
    const { agent } = await this.#find(ref);
    const answerChat = this.#parts.answerChat;
    if (answerChat === undefined) {
      throw new KindedError("unavailable", "The engine isn't answering.");
    }
    return answerChat({
      settings: { hubId: ref.hubId, agentId: ref.id },
      messages: request.messages,
      tools: [],
      // The file allows up to 200 model calls; a chat answer stops at 64 turns.
      turnLimit: Math.min(agent.maxSteps, maxTurnLimit),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.listener === undefined ? {} : { listener: request.listener }),
    });
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
      "skills",
      "knowledge",
      "connectors",
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

  /** The path of the agent's file; throws `not_found` when the agent isn't there. */
  async filePath(ref: AgentRef): Promise<string> {
    return (await this.#find(ref)).path;
  }

  /**
   * Moves the agent's file to the trash as one change. Undo is the workspace's undo, so it puts the
   * agent back only while the delete is still the newest step: after any other change it rejects
   * and undoes nothing.
   */
  async trash(ref: AgentRef): Promise<TrashedAgent> {
    const { files } = this.#parts;
    const { agent, path } = await this.#find(ref);
    files.change(`Deleted agent ${agent.name}`, { [path]: null });
    const afterDelete = files.step;
    return {
      undo: async () => {
        if (files.step !== afterDelete || !files.undo()) {
          throw new KindedError(
            "conflict",
            `${agent.name} can't be put back, because the workspace changed after it was deleted.`,
          );
        }
      },
    };
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

  /**
   * The hub's default model, else the workspace's; `undefined` when neither names one, or the one
   * named is neither an alias nor a `provider/model` name.
   */
  async defaultModel(hubId: string): Promise<string | undefined> {
    const workspace = await this.#load();
    const hub = filesOf(workspace, "hub").find((file) => file.hub === hubId)?.value;
    const settings = filesOf(workspace, "workspace")[0]?.value;
    const name = hub?.defaults.model ?? settings?.defaults.model;
    return name !== undefined && resolveModel(workspace, hubId, name) !== undefined
      ? name
      : undefined;
  }

  /** The workflows of the agent's hub that run it in a step, with how many steps; throws `not_found` when the agent isn't there. */
  async referencesTo({ hubId, id }: AgentRef): Promise<readonly AgentUser[]> {
    const workspace = await this.#load();
    if (!filesOf(workspace, "agent").some((one) => one.hub === hubId && one.value.id === id)) {
      throw agentGone();
    }
    return filesOf(workspace, "workflow")
      .filter((file) => file.hub === hubId)
      .map((file) => ({
        hubId,
        id: file.value.id,
        name: file.value.name,
        steps: Object.values(file.value.states).filter((state) => state.agent === id).length,
      }))
      .filter((user) => user.steps > 0);
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

  /**
   * The workspace's hubs, its shared library, its `models.yaml` and its settings as files, with
   * unsaved changes applied.
   */
  #source(): DefinitionSource {
    const { files } = this.#parts;
    const existing = async (path: string) => ((await files.read(path)) === null ? [] : [path]);
    return {
      location: "workspace:unsaved",
      list: async () => [
        ...(await files.list("hubs")),
        ...(await files.list(sharedLibraryFolder)),
        ...(await existing(modelsFile)),
        ...(await existing(settingsPath)),
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
