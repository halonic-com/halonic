import { type ChatAnswer, maxTurnLimit } from "@halonicjs/app";
import { promptFor } from "@halonicjs/openui-lang";
import { KindedError, slugify, uniqueName } from "@halonicjs/std";
import type {
  AgentChange,
  AgentChatRequest,
  AgentHarnessId,
  AgentHub,
  AgentListing,
  AgentLiveState,
  AgentPlacementState,
  AgentRef,
  AgentRoutine,
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
  SavedChatsPlace,
  ThisComputerChoice,
  TrashedAgent,
  TryItChanges,
} from "@halonicjs/studio-feature-agents/api";
import { loopRefusal } from "@halonicjs/studio-feature-agents/api";
import { filesOf, loadWorkspace, modelAliases } from "@halonicjs/workspace";
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
import { missingModelKeyOf } from "./agent-model-key.ts";
import { paramsEdits, paramsOf } from "./agent-params.ts";
import { choicesHere } from "./agent-placement-choices.ts";
import { agentRoutinesOf, agentUsersOf, defaultModelOf, toolOptionsOf } from "./agent-reads.ts";
import { agentFolder, unsavedWorkspaceSource } from "./agent-source.ts";
import { placeNewAgent } from "./new-agent-placing.ts";
import type { WorkspaceAgentsParts } from "./workspace-agents-parts.ts";

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
  /** The last edit asked for, which the next one waits for. */
  #lastUpdate: Promise<void> = Promise.resolve();
  /** Told when a Where it runs choice is saved: a choice changes no file, so `onChange` misses it. */
  readonly #choiceListeners = new Set<() => void>();

  /** Present only when the app can open Create version; see {@link AgentsHost.makeLive}. */
  makeLive?: NonNullable<AgentsHost["makeLive"]>;
  /** Present only where there is a folder to trust; see {@link AgentsHost.mayStart}. */
  mayStart?: NonNullable<AgentsHost["mayStart"]>;
  /** Present only where the window can show the trust check; see {@link AgentsHost.askTrust}. */
  askTrust?: NonNullable<AgentsHost["askTrust"]>;
  /** Present only where there is a folder to trust; see {@link AgentsHost.workspaceName}. */
  workspaceName?: NonNullable<AgentsHost["workspaceName"]>;
  /** Present only where the workspace's chats are saved; see {@link AgentsHost.savedChats}. */
  readonly savedChats?: SavedChatsPlace;
  /** Present only where keys can be asked; see {@link AgentsHost.missingModelKey}. */
  missingModelKey?: NonNullable<AgentsHost["missingModelKey"]>;

  constructor(parts: WorkspaceAgentsParts) {
    this.#parts = parts;
    const { versionDialog, trust, savedChats, hasKey } = parts;
    if (savedChats !== undefined) this.savedChats = savedChats;
    if (hasKey !== undefined) {
      this.missingModelKey = async (ref) => {
        const { agent } = await this.#find(ref);
        return missingModelKeyOf(await this.#load(), ref.hubId, agent, hasKey);
      };
    }
    if (versionDialog !== undefined) {
      // Only the agent's own file, so the version holds nothing else the person changed.
      this.makeLive = async (ref, options) =>
        versionDialog([(await this.#find(ref)).path], options);
    }
    if (trust !== undefined) {
      this.mayStart = trust.mayStart;
      this.askTrust = trust.askTrust;
      this.workspaceName = () => trust.workspaceName;
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
      ...(agent.chatUi !== undefined && { chatUi: agent.chatUi.components }),
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
    return toolOptionsOf(await this.#load(), ref.hubId);
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
   * uses the agent as it's saved, with its own tools; the chat adds none of its own. An agent whose
   * `chatUi` is on is first told which components it may draw (`promptFor`); a click on one is
   * then a message like any other, so trust, `asks`, `allowedSites` and approvals stay as they are.
   */
  async answer(ref: AgentRef, request: AgentChatRequest): Promise<ChatAnswer> {
    const { agent } = await this.#find(ref);
    const answerChat = this.#parts.answerChat;
    if (answerChat === undefined) {
      throw new KindedError("unavailable", "The engine isn't answering.");
    }
    return answerChat({
      settings: { hubId: ref.hubId, agentId: ref.id },
      messages:
        agent.chatUi === undefined
          ? request.messages
          : [{ role: "system", content: promptFor(agent.chatUi.components) }, ...request.messages],
      tools: [],
      // The file allows up to 200 model calls; a chat answer stops at 64 turns.
      turnLimit: Math.min(agent.maxSteps, maxTurnLimit),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      ...(request.listener === undefined ? {} : { listener: request.listener }),
    });
  }

  /** Where the agent runs on this computer; `undefined` without an agent host. */
  async placement(ref: AgentRef): Promise<AgentPlacementState | undefined> {
    const { path } = await this.#find(ref);
    const choices = this.#parts.placement;
    if (choices === undefined) return undefined;
    return {
      ...(await choices.where(ref)),
      unsaved: Object.hasOwn(this.#parts.files.pending, path),
      studioStartsUnfenced: await choices.studioStartsUnfenced(),
    };
  }

  /** Saves On this computer for the file the person was warned about. */
  async chooseThisComputer(ref: AgentRef, shownFingerprint: string): Promise<ThisComputerChoice> {
    await this.#find(ref);
    const chosen = await choicesHere(this.#parts.placement).chooseThisComputer(
      ref,
      shownFingerprint,
    );
    if (chosen.saved) this.#choiceSaved();
    return chosen;
  }

  /** Puts the agent back in its sandbox on this computer. */
  async chooseSandbox(ref: AgentRef): Promise<void> {
    await this.#find(ref);
    await choicesHere(this.#parts.placement).chooseSandbox(ref);
    this.#choiceSaved();
  }

  #choiceSaved(): void {
    for (const listener of [...this.#choiceListeners]) listener();
  }

  /**
   * Edits the agent's file in place, so comments and the order of its keys stay, as one undoable
   * change. Typing in one field coalesces into one step. Edits run one after another, each on the
   * file as the one before left it, so two edits made close together both stay.
   */
  update(ref: AgentRef, change: AgentChange): Promise<void> {
    const edited = this.#lastUpdate.then(() => this.#update(ref, change));
    // The next edit waits for this one, whether or not it worked; the caller hears how it went.
    this.#lastUpdate = edited.catch(() => undefined);
    return edited;
  }

  async #update(ref: AgentRef, change: AgentChange): Promise<void> {
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

  /** Watches the agent's changes to review for Try it; nothing to watch without the review service. */
  watchTryItChanges(ref: AgentRef, listener: (changes: TryItChanges) => void): () => void {
    const watch = this.#parts.tryItChanges;
    if (watch === undefined) return () => {};
    return watch(() => this.filePath(ref), listener);
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

  async routinesOf(ref: AgentRef): Promise<readonly AgentRoutine[]> {
    await this.#find(ref);
    return agentRoutinesOf(await this.#load(), ref);
  }

  /** Calls `listener` on each change of the workspace's files and each saved Where it runs choice. */
  subscribe(listener: () => void): () => void {
    this.#choiceListeners.add(listener);
    const stop = this.#parts.onChange(listener);
    return () => {
      this.#choiceListeners.delete(listener);
      stop();
    };
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
    const workspace = await loadWorkspace(unsavedWorkspaceSource(this.#parts.files));
    this.#hubs = filesOf(workspace, "hub").map((file) => ({
      id: file.value.id,
      name: file.value.name,
    }));
    return workspace;
  }
}
