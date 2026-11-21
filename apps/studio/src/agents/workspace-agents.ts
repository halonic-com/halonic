import { type ChatAnswer, type ChatAnswerRequest, maxTurnLimit } from "@halonicjs/app";
import type { DefinitionSource } from "@halonicjs/ports";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentChange,
  AgentChatRequest,
  AgentHarnessId,
  AgentHub,
  AgentListing,
  AgentLiveState,
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
import { loopRefusal } from "@halonicjs/studio-feature-agents/api";
import { filesOf, loadWorkspace, modelAliases, settingsPath } from "@halonicjs/workspace";
import { editYaml, type YamlEdit } from "@halonicjs/yaml";
import { hubFilesFor } from "../studio/first-hub.ts";
import {
  agentGone,
  agentSuffix,
  changeProblem,
  listingOf,
  newAgentText,
  outputValue,
  trashAgentFile,
} from "./agent-file.ts";
import { paramsEdits, paramsOf } from "./agent-params.ts";
import { agentUsersOf, defaultModelOf } from "./agent-reads.ts";
import { type NewAgentsParts, placeNewAgent } from "./new-agent-placing.ts";

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
   * Asks the agent host whether a harness can run for this agent; rejects when the host can't be
   * asked. Absent where there is no agent host (the browser), which answers "couldn't check".
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
  /**
   * The live state of a workspace file (core's `liveState`), by its path from the workspace
   * folder. Without it an agent counts as live, as a routine does, so the page shows no line.
   */
  readonly liveness?: (path: string) => Promise<AgentLiveState>;
  /**
   * Answers a chat on the workspace's engine: `ChatService.answer` on the engine's executor,
   * which opens the engine on first use. Absent where there is no engine, which answers
   * "The engine isn't answering."
   */
  readonly answerChat?: (request: ChatAnswerRequest) => Promise<ChatAnswer>;
  /**
   * Opens Create version with only `paths` in it (source control's `VersionDialogService`), and
   * answers once a version is made or the dialog is closed. Absent where the app can't offer that,
   * so there is no `makeLive`.
   */
  readonly versionDialog?: (paths: readonly string[]) => Promise<"made" | "cancelled">;
}

/** Where the agent files of a hub are kept. */
const agentFolder = (hubId: string): string => `hubs/${hubId}/agents`;

/** Where the workspace keeps the skills, knowledge and connectors its hubs share. */
const sharedLibraryFolder = "library";

/** The workspace's model aliases, which every hub can use. */
const modelsFile = "models.yaml";

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

  /** Present only when the app can open Create version; see {@link AgentsHost.makeLive}. */
  makeLive?: NonNullable<AgentsHost["makeLive"]>;

  constructor(parts: WorkspaceAgentsParts) {
    this.#parts = parts;
    const { versionDialog } = parts;
    if (versionDialog !== undefined) {
      // Only the agent's own file, so the version holds nothing else the person changed.
      this.makeLive = async (ref) => versionDialog([(await this.#find(ref)).path]);
    }
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
        outputFields: method.output === "text" ? undefined : Object.keys(method.output),
        tools: method.tools,
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

  /**
   * Whether `harness` can run for this agent; `halonic` always can. `failed` is only the host's own
   * answer: when the host can't be asked, or there is none, it rejects with the reason, so the
   * page says "Couldn't check" rather than that it found the program.
   */
  async harnessReadiness(ref: AgentRef, harness: AgentHarnessId): Promise<HarnessReadiness> {
    await this.#find(ref);
    if (harness === "halonic") return { status: "ready", version: "" };
    const detect = this.#parts.detectHarness;
    if (detect === undefined) {
      throw new KindedError(
        "unavailable",
        "Halonic can't check programs on this computer from here.",
      );
    }
    return await detect(ref, harness);
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
    // Named before the change, which tells listeners, so a tab named again reads the new name.
    if (change.name !== undefined) this.#names.set(`${ref.hubId}/${ref.id}`, change.name);
    this.#parts.files.change(
      `Changed agent ${change.name ?? ref.id}`,
      { [path]: edited.value.text },
      { coalesceKey: `agent:${path}:${fields}` },
    );
  }

  /** Throws `conflict` when one of the subagents `next` adds would hand work back to the agent. */
  async #refuseLoops(ref: AgentRef, now: readonly string[], next: readonly string[]) {
    const refusal = loopRefusal(await this.#team(ref.hubId), ref.id, now, next);
    if (refusal !== undefined) throw new KindedError("conflict", refusal);
  }

  /** Whether the agent's saved file is live; throws `not_found` when the agent isn't there. */
  async liveState(ref: AgentRef): Promise<AgentLiveState> {
    const { path } = await this.#find(ref);
    return (await this.#parts.liveness?.(path)) ?? "live";
  }

  /** The path of the agent's file; throws `not_found` when the agent isn't there. */
  async filePath(ref: AgentRef): Promise<string> {
    return (await this.#find(ref)).path;
  }

  /** Moves the agent's file to the trash as one change, with the undo {@link trashAgentFile} gives. */
  async trash(ref: AgentRef): Promise<TrashedAgent> {
    const { agent, path } = await this.#find(ref);
    return trashAgentFile(this.#parts.files, path, agent.name);
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

  /** The default model of {@link defaultModelOf}, on the workspace as it is now. */
  async defaultModel(hubId: string): Promise<string | undefined> {
    return defaultModelOf(await this.#load(), hubId);
  }

  /** The workflows that run the agent, as {@link agentUsersOf} finds them. */
  async referencesTo(ref: AgentRef): Promise<readonly AgentUser[]> {
    return agentUsersOf(await this.#load(), ref);
  }

  subscribe(listener: () => void): () => void {
    return this.#parts.onChange(listener);
  }

  /**
   * Creates the agent in `hubId`, with the Default hub when the workspace has no hub yet; throws
   * `not_found` for any other hub the workspace doesn't have, so no stray folder is made.
   */
  async create({ name, hubId, instructions = "" }: NewAgent): Promise<AgentRef> {
    const workspace = await this.#load();
    const hubFiles = hubFilesFor(workspace.issues, this.#hubs, hubId);
    const folder = agentFolder(hubId);
    const taken = (await this.#parts.files.list(folder))
      .filter((path) => path.startsWith(`${folder}/`) && path.endsWith(agentSuffix))
      .map((path) => path.slice(folder.length + 1, -agentSuffix.length))
      .filter((id) => !id.includes("/"));
    const id = uniqueName(slugify(name), taken);
    const text = newAgentText(id, name, instructions);
    this.#parts.files.change(`Created agent ${name}`, {
      ...hubFiles,
      [`${folder}/${id}${agentSuffix}`]: text,
    });
    this.#names.set(`${hubId}/${id}`, name);
    await placeNewAgent(this.#parts.newAgents, hubId, id, text);
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
