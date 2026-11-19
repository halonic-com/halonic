import { type AgentPlacement, type HostSettings, newAgentPlacement } from "@halonicjs/app";
import type { DefinitionSource } from "@halonicjs/ports";
import { encodeUtf8, KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentChange,
  AgentHarnessId,
  AgentHub,
  AgentListing,
  AgentOutput,
  AgentRef,
  AgentSettings,
  AgentsHost,
  AgentTeamMember,
  AgentToolList,
  AgentToolOption,
  AgentUser,
  HarnessReadiness,
  HarnessSignIn,
  NewAgent,
  NewAgentStep,
  TrashedAgent,
} from "@halonicjs/studio-feature-agents/api";
import { alreadyHandsWork, handOffPath } from "@halonicjs/studio-feature-agents/api";
import {
  filesOf,
  loadWorkspace,
  modelAliases,
  resolveModel,
  settingsPath,
} from "@halonicjs/workspace";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";
import { paramsEdits, paramsOf, paramsProblem } from "./agent-params.ts";

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
   * What Settings › New agents run needs to place each new agent. Absent where there is no agent
   * host (the browser), so a new agent stays in its sandbox.
   */
  readonly newAgents?: NewAgentsParts;
  /**
   * Asks the agent host to open a harness's own sign-in for this agent, in its own settings
   * folder. Absent where there is no agent host (the browser), which refuses with the reason.
   */
  readonly openSignIn?: (ref: AgentRef, harness: AgentHarnessId) => Promise<HarnessSignIn>;
}

/** What {@link WorkspaceAgents} applies Settings › New agents run (`sandbox.new-agents`) with. */
export interface NewAgentsParts {
  /** The host settings, where Settings saves the choice. */
  readonly settings: HostSettings;
  /** The "On this computer" choices, kept by the agent host in the person's profile. */
  readonly placement: AgentPlacement;
  /** The workspace's real path, which the choices are kept for. */
  readonly location: string;
  /** Gets a choice that couldn't be saved; the agent is made all the same, in its sandbox. */
  readonly reportError: (error: unknown) => void;
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
      output: agent.output,
      maxSteps: agent.maxSteps,
      params: paramsOf(agent.params),
      harness: agent.harness ?? "halonic",
      skills: agent.skills,
      knowledge: agent.knowledge,
      connectors: agent.connectors,
      subagents: agent.subagents,
      agentSteps: Object.entries(agent.methods).map(([stepId, method]) => ({
        id: stepId,
        description: method.description,
        instructions: method.instructions,
        model: method.model,
        maxSteps: method.maxSteps,
      })),
    };
  }

  /**
   * Adds an agent step to the agent's file in place, as one undoable change, with the id taken from
   * its name; throws `invalid_input` for an empty name or instructions and `not_found` when the
   * agent isn't there.
   */
  async addAgentStep(ref: AgentRef, { name, instructions }: NewAgentStep): Promise<string> {
    if (name.trim() === "" || instructions.trim() === "") {
      throw new KindedError("invalid_input", "An agent step needs a name and instructions.");
    }
    const { agent, path } = await this.#find(ref);
    const text = await this.#parts.files.read(path);
    if (text === null) throw agentGone();
    const id = uniqueName(slugify(name), Object.keys(agent.methods));
    const edited = editYaml(text, [
      { kind: "set", path: ["methods", id], value: { instructions: instructions.trim() } },
    ]);
    if (!edited.ok) {
      throw new KindedError(
        "invalid_input",
        "This agent's file couldn't be changed as it is written.",
      );
    }
    this.#parts.files.change(`Added agent step ${id} to ${agent.name}`, {
      [path]: edited.value.text,
    });
    return id;
  }

  /** The agents of the agent's hub with their subagents, sorted by name; throws `not_found` when the agent isn't there. */
  async team(ref: AgentRef): Promise<readonly AgentTeamMember[]> {
    await this.#find(ref);
    return this.#team(ref.hubId);
  }

  async #team(hubId: string): Promise<AgentTeamMember[]> {
    return filesOf(await this.#load(), "agent")
      .filter((file) => file.hub === hubId)
      .map((file) => ({ ...listingOf(hubId, file.value), subagents: file.value.subagents }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
   * Opens the harness's own sign-in for this agent in a terminal the person can see; rejects with
   * the reason where there is no agent host, and with `not_found` when the agent isn't there.
   */
  async openHarnessSignIn(
    ref: AgentRef,
    harness: Exclude<AgentHarnessId, "halonic">,
  ): Promise<HarnessSignIn> {
    await this.#find(ref);
    const openSignIn = this.#parts.openSignIn;
    if (openSignIn === undefined) {
      throw new Error("Halonic can't open a terminal on this computer from here.");
    }
    return openSignIn(ref, harness);
  }

  /**
   * Edits the agent's file in place, so comments and the order of its keys stay, as one undoable
   * change. Typing in one field coalesces into one step.
   */
  async update(ref: AgentRef, change: AgentChange): Promise<void> {
    const problem = changeProblem(change);
    if (problem !== undefined) throw new KindedError("invalid_input", problem);
    const { agent, path } = await this.#find(ref);
    if (change.subagents !== undefined)
      await this.#refuseLoops(ref, agent.subagents, change.subagents);
    const text = await this.#parts.files.read(path);
    if (text === null) throw agentGone();
    const values = { ...change, output: change.output && outputValue(change.output) };
    const edits: YamlEdit[] = [];
    for (const field of [
      "name",
      "description",
      "instructions",
      "output",
      "model",
      "maxSteps",
      "harness",
      "skills",
      "knowledge",
      "connectors",
      "subagents",
    ] as const) {
      const value = values[field];
      if (value !== undefined) edits.push({ kind: "set", path: [field], value });
    }
    if (change.params !== undefined) edits.push(...paramsEdits(agent.params, change.params));
    // Clearing a model setting the file doesn't have changes nothing, and makes no undo step.
    if (edits.length === 0) return;
    const edited = editYaml(text, edits);
    if (!edited.ok) {
      throw new KindedError(
        "invalid_input",
        "This agent's file couldn't be changed as it is written.",
      );
    }
    // Each model setting is its own field, so typing in one doesn't merge with another.
    const fields = edits.map((edit) => edit.path.join(".")).join(",");
    this.#parts.files.change(
      `Changed agent ${change.name ?? ref.id}`,
      { [path]: edited.value.text },
      { coalesceKey: `agent:${path}:${fields}` },
    );
    if (change.name !== undefined) this.#names.set(`${ref.hubId}/${ref.id}`, change.name);
  }

  /** Throws `conflict` when one of the subagents `next` adds would hand work back to the agent. */
  async #refuseLoops(ref: AgentRef, now: readonly string[], next: readonly string[]) {
    const team = await this.#team(ref.hubId);
    for (const id of next.filter((each) => !now.includes(each))) {
      const way = handOffPath(team, id, ref.id);
      if (way !== undefined) {
        const names = way.map((each) => team.find((member) => member.id === each)?.name ?? each);
        throw new KindedError("conflict", `${alreadyHandsWork(names)}; that would be a loop.`);
      }
    }
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
    const text = newAgentText(id, name, instructions);
    this.#parts.files.change(`Created agent ${name}`, { [`${folder}/${id}${agentSuffix}`]: text });
    this.#names.set(`${hubId}/${id}`, name);
    await this.#placeNew(id, text);
    return { hubId, id };
  }

  /**
   * Applies Settings › New agents run to the agent just made, for its file as written: "On this
   * computer" records that choice for it, anything else leaves it in its sandbox. A choice that
   * can't be saved goes to `reportError` and leaves it in its sandbox too.
   */
  async #placeNew(agent: string, text: string): Promise<void> {
    const parts = this.#parts.newAgents;
    if (parts === undefined) return;
    const subject = { location: parts.location, agent, file: encodeUtf8(text) };
    try {
      const placed = await newAgentPlacement(parts.settings, parts.placement, subject);
      if (!placed.ok) {
        parts.reportError(new Error(`The new agent's file changed while it was placed: ${agent}.`));
      }
    } catch (error) {
      parts.reportError(error);
    }
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

/** The `output` as the file writes it: a JSON reply without a schema has no `schema` key. */
function outputValue(output: AgentOutput): AgentOutput {
  return output.type === "json" && output.schema === undefined ? { type: "json" } : output;
}

/** Why a change can't be written, as the agent file's schema would refuse it; `undefined` when it can. */
function changeProblem(change: AgentChange): string | undefined {
  if (change.name !== undefined && change.name.trim() === "") return "An agent needs a name.";
  const { maxSteps } = change;
  if (maxSteps !== undefined && !(Number.isInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 200)) {
    return "The turn limit is a whole number from 1 to 200.";
  }
  if (change.output?.type === "choice" && change.output.options.length === 0) {
    return "A list of options needs at least one.";
  }
  return change.params === undefined ? undefined : paramsProblem(change.params);
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
