/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `AgentsHostService` for each open workspace; the Agents feature's list,
 * dialogs and page read it, and the Workflows feature reads `referencesTo` for its "used by" line.
 */
import type { ChatAnswer, ChatAnswerListener } from "@halonicjs/app";
import type { ChatComponentName } from "@halonicjs/openui-lang";
import type { ChatMessage, ChatSessions } from "@halonicjs/ports";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { TryItChanges } from "./chat/try-it-changes.ts";
import type { AgentHarnessId, HarnessReadiness, HarnessSignIn } from "./harness-api.ts";
import type { AgentPlacementState, ThisComputerChoice } from "./placement-api.ts";
import type { AgentTeamMember } from "./team.ts";

export {
  type AgentHarnessId,
  agentHarnessIds,
  type HarnessReadiness,
  type HarnessSignIn,
} from "./harness-api.ts";
export { type AgentTeamMember, alreadyHandsWork, handOffPath, loopRefusal } from "./team.ts";

/** Names one agent the way a deep link does: its hub and its id. */
export interface AgentRef {
  readonly hubId: string;
  readonly id: string;
}

/** What an agent's row on the Agents list shows. */
export interface AgentListing extends AgentRef {
  /** The display name; renaming changes it and keeps the id. */
  readonly name: string;
  /** What the agent is for, as its file says. The row shows it under the name, and the list search reads it. */
  readonly description?: string | undefined;
  /** The name of the model the agent uses, as its row shows it; absent when the file names none. */
  readonly model?: string | undefined;
}

/**
 * The shape of the agent's replies (the file's `output`): free text, exactly one of a list of
 * options, or JSON that a schema checks.
 */
export type AgentOutput =
  | { readonly type: "text" }
  | { readonly type: "choice"; readonly options: readonly string[] }
  | {
      readonly type: "json";
      /** The JSON Schema the agent is asked to reply in; absent when the file gives none. The engine doesn't check replies against it. */
      readonly schema?: Readonly<Record<string, unknown>> | undefined;
    };

/** How hard a model that can reason thinks before it replies (the file's `params.reasoningEffort`). */
export type AgentReasoningEffort = "low" | "medium" | "high";

/** The efforts in the order the Model page lists them. */
export const agentReasoningEfforts: readonly AgentReasoningEffort[] = ["low", "medium", "high"];

/**
 * How the model is tuned for this agent (the file's `params`). A setting left out uses the
 * model's own default.
 */
export interface AgentModelParams {
  /** From 0 to 2. */
  readonly temperature?: number | undefined;
  /** From 0 to 1. */
  readonly topP?: number | undefined;
  /** The longest reply, in tokens: a whole number above 0. */
  readonly maxTokens?: number | undefined;
  /** Where a reply ends: none of these is in it. */
  readonly stop?: readonly string[] | undefined;
  readonly reasoningEffort?: AgentReasoningEffort | undefined;
}

/** A change to some of the model settings: a value sets it, `null` takes it out of the file. */
export type AgentModelParamsChange = {
  readonly [Key in keyof AgentModelParams]?: Exclude<AgentModelParams[Key], undefined> | null;
};

export type {
  AgentPlacementState,
  SavedFilePlacement,
  ThisComputerChoice,
} from "./placement-api.ts";
export {
  type AgentChangeToReview,
  type AgentReview,
  type AgentReviewDecision,
  type AgentReviewHost,
  AgentReviewService,
  type AgentReviewTarget,
} from "./review-api.ts";

/** What the Configuration pages show of an agent. */
export interface AgentSettings extends AgentListing {
  /** What the agent is told to do; empty before anyone writes it. */
  readonly instructions: string;
  /** The shape of its replies; text when the file says none. */
  readonly output: AgentOutput;
  /** The most model calls in one step of the agent (its model call limit); 6 when the file says none. */
  readonly maxSteps: number;
  /** The model settings the file sets; none when it sets none. */
  readonly params: AgentModelParams;
  /** The program the agent runs in; `halonic` when its file names none. */
  readonly harness: AgentHarnessId;
  /** The ids of the skills it uses, in the file's order. */
  readonly skills: readonly string[];
  /** The ids of the knowledge sources it searches, in the file's order. */
  readonly knowledge: readonly string[];
  /** The ids of the connectors whose tools it may use, in the file's order. */
  readonly connectors: readonly string[];
  /** The ids of the agents of its hub it hands work to (its subagents), in the file's order. */
  readonly subagents: readonly string[];
  /** Its agent steps (`methods` in its file), in the file's order. */
  readonly agentSteps: readonly AgentStep[];
  /** The components its `chatUi` lets it draw in chat replies; absent when the file has none. */
  readonly chatUi?: readonly ChatComponentName[] | undefined;
}

/**
 * One of an agent's agent steps (`methods` in its file): a named piece of work inside the agent,
 * with its own instructions, that a workflow step can call.
 */
export interface AgentStep {
  /** Its name in the file, which a workflow step calls it by, such as `draft-reply`. */
  readonly id: string;
  /** What it is for, in one line; absent when the file says nothing. */
  readonly description?: string | undefined;
  readonly instructions: string;
  /** Its own model alias; absent when it uses the agent's. */
  readonly model?: string | undefined;
  /** Its own model call limit; absent when it uses the agent's. */
  readonly maxSteps?: number | undefined;
  /** The field names of its JSON answer, in the file's order; absent when it answers in text. */
  readonly outputFields?: readonly string[] | undefined;
  /** The tools it may use; absent when it may use all of the agent's, empty for none. */
  readonly tools?: readonly string[] | undefined;
}

/** What the New agent step dialog hands over. */
export interface NewAgentStep {
  /** The name typed; the agent step's id is taken from it (`-2` when the agent has it). */
  readonly name: string;
  /** What it should do: its instructions, which can't be empty. */
  readonly instructions: string;
}

/**
 * Whether the agent's saved file is what runs (save model 2.4, `app.live-state`): `live` when the
 * latest version has it as saved, or when the workspace keeps no history; `not-live` when the saved
 * file differs from it; `never-versioned` when no version has the agent yet.
 */
export type AgentLiveState = "never-versioned" | "live" | "not-live";

/** The lists of the Tools page: what an agent uses of the Library. */
export type AgentToolList = "skills" | "knowledge" | "connectors";

/** The Tools page's lists, in the order it shows them. */
export const agentToolLists: readonly AgentToolList[] = ["skills", "knowledge", "connectors"];

/** A Library item an agent can be given: its id, as the agent's file names it, and its name. */
export interface AgentToolOption {
  readonly id: string;
  readonly name: string;
  /**
   * For a connector: how many of its tools can run without a person's approval, by the engine's
   * rule (the ones `tools.read` marks as only reading); every other tool asks first, so 0 means
   * every tool does. Absent for a skill or knowledge.
   */
  readonly toolsWithoutAsking?: number | undefined;
}

/** A change to an agent's settings; a field left out stays as it is. */
export interface AgentChange {
  /** The new display name. The id stays, and no other file changes. */
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly instructions?: string | undefined;
  /** The whole `output`; a list of options needs at least one. */
  readonly output?: AgentOutput | undefined;
  /** The model alias, or `provider/model`. */
  readonly model?: string | undefined;
  /** The model call limit, a whole number from 1 to 200. */
  readonly maxSteps?: number | undefined;
  /** Only the model settings named; the others, and the file's provider extras, stay. */
  readonly params?: AgentModelParamsChange | undefined;
  /** The program the agent runs in. */
  readonly harness?: AgentHarnessId | undefined;
  /** The whole list of skill ids. */
  readonly skills?: readonly string[] | undefined;
  /** The whole list of knowledge source ids. */
  readonly knowledge?: readonly string[] | undefined;
  /** The whole list of connector ids. */
  readonly connectors?: readonly string[] | undefined;
  /** The whole list of subagent ids. */
  readonly subagents?: readonly string[] | undefined;
}

/** A hub a new agent can go in. */
export interface AgentHub {
  readonly id: string;
  readonly name: string;
}

/** What the New agent dialog hands over. */
export interface NewAgent {
  readonly name: string;
  readonly hubId: string;
  /** What it should do, written in the dialog; it becomes the agent's instructions. Absent or empty: none yet. */
  readonly instructions?: string | undefined;
}

/** An agent that was moved to the trash, and the way to bring it back. */
export interface TrashedAgent {
  /**
   * Puts the agent back, after later changes too. It rejects with `conflict`, and undoes nothing,
   * when a file has taken its place since.
   */
  undo(): Promise<void>;
}

/** One answer of an agent's Try it chat. */
export interface AgentChatRequest {
  /** The conversation so far, with the person's new message last. It is not changed. */
  readonly messages: readonly ChatMessage[];
  /** Aborted when the person clicks Stop. */
  readonly signal?: AbortSignal | undefined;
  /** Told how the answer goes, for the transcript: each turn, tool call and message. */
  readonly listener?: ChatAnswerListener | undefined;
}

/** An agent's model that needs an API key that isn't stored here (states H19). */
export interface MissingModelKey {
  /** The model as the agent's file names it, such as `smart`. */
  readonly model: string;
  /** The provider's name, such as Anthropic. */
  readonly provider: string;
  /** The name the provider's key is stored under, never the key, for its key block on Models. */
  readonly secretName: string;
}

/** A workflow that runs an agent in one of its task steps. */
export interface AgentUser {
  readonly hubId: string;
  /** The workflow's id. */
  readonly id: string;
  /** The workflow's display name. */
  readonly name: string;
  /** The ids of the workflow's steps that run the agent, in the workflow's order: one or more. */
  readonly stepIds: readonly string[];
  /**
   * Those steps as their cards on the workflow's canvas name them, in the same order: each one's
   * title, else its id (C618). Absent names them by id.
   */
  readonly stepNames?: readonly string[] | undefined;
}

/** A routine that starts an agent by itself, not through a workflow. */
export interface AgentRoutine {
  /** The routine's hub; `null` for one at the workspace's root. */
  readonly hubId: string | null;
  /** The routine's id. */
  readonly id: string;
  /** The routine's display name. */
  readonly name: string;
}

export {
  noTryItChanges,
  type TryItChanges,
  type TryItLeftOutReason,
} from "./chat/try-it-changes.ts";
export {
  TryItChangesLine,
  type TryItChangesLineProps,
  type WatchTryItChanges,
} from "./chat/try-it-changes-line.tsx";
export {
  ConfirmAgainCallouts,
  type ConfirmAgainCalloutsProps,
  type RunAgent,
} from "./confirm-again/confirm-again-callouts.tsx";
export { selectStepsStep, stepsToSelect } from "./select-steps.ts";
export { WHERE_IT_RUNS_STEP } from "./where-it-runs-step.ts";

/** Where one workspace's chats are saved: the store, and the workspace's resolved real path in it. */
export interface SavedChatsPlace {
  readonly sessions: ChatSessions;
  readonly location: string;
}

/**
 * The workspace's agents, as the app reads and changes them. The app saves to the workspace's files
 * itself, so listing and creating work while the engine is stopped.
 */
export interface AgentsHost {
  /** The hubs an agent can be created in, in the workspace's order. */
  hubs(): readonly AgentHub[];
  /** Every agent in the workspace's hubs. Rejects with the reason it couldn't read them. */
  list(): Promise<readonly AgentListing[]>;
  /** One agent's row. Rejects with the reason it couldn't be read, or with `not_found` when it isn't there. */
  read(ref: AgentRef): Promise<AgentListing>;
  /** One agent's settings. Rejects like {@link AgentsHost.read}. */
  settings(ref: AgentRef): Promise<AgentSettings>;
  /**
   * Saves a change to an agent's file and keeps every comment and line of it that the change
   * doesn't touch. Typing in one field is one undo step. Rejects with `not_found` when the agent
   * isn't there, with `invalid_input` when the name or the output's list of options is empty or a
   * model setting is out of its range, with `conflict` when a new subagent would close a loop (its
   * message names who already hands work to whom), and with the reason it couldn't write.
   */
  update(ref: AgentRef, change: AgentChange): Promise<void>;
  /** The model aliases the agent's hub can use, by name, in the order the Models pages list them; empty when there are none. */
  modelAliases(ref: AgentRef): Promise<readonly string[]>;
  /**
   * The model an agent of this hub uses when its file names none: the hub's default, else the
   * workspace's; `undefined` when neither names one. Rejects with the reason it couldn't read it.
   */
  defaultModel(hubId: string): Promise<string | undefined>;
  /**
   * The Library items the agent's hub can use, for the Tools page's pickers: the hub's own and the
   * shared ones (only those its `uses` lists, when it has one), each list in the Library's order.
   * Rejects with `not_found` when the agent isn't there, and with the reason it couldn't read them.
   */
  toolOptions(ref: AgentRef): Promise<Readonly<Record<AgentToolList, readonly AgentToolOption[]>>>;
  /**
   * Adds an agent step to the agent's file, with the id taken from its name (`-2` when the agent
   * has it), as one change, and returns the id. Rejects with `not_found` when the agent isn't
   * there, with `invalid_input` when the name or the instructions are empty, and with the reason
   * it couldn't write.
   */
  addAgentStep(ref: AgentRef, step: NewAgentStep): Promise<string>;
  /**
   * Every agent of the agent's hub, itself included, with the agents each hands work to, sorted by
   * name, for the Subagents page. Rejects with `not_found` when the agent isn't there, and with the
   * reason it couldn't read them.
   */
  team(ref: AgentRef): Promise<readonly AgentTeamMember[]>;
  /**
   * Whether `harness` can run on this computer, for this agent (its sign-in is the agent's own).
   * `failed` is the host's answer when it found the program but couldn't ask its version. Rejects
   * with the reason when the host itself can't be asked, or there is none, and with `not_found`
   * for an agent that isn't there. `halonic` is always `ready`.
   */
  harnessReadiness(ref: AgentRef, harness: AgentHarnessId): Promise<HarnessReadiness>;
  /**
   * Opens `harness`'s own sign-in for this agent, in its own settings folder, in a terminal the
   * person can see; Halonic never sees or copies the sign-in. Rejects with the reason it couldn't
   * ask, such as no agent host here.
   */
  openHarnessSignIn(
    ref: AgentRef,
    harness: Exclude<AgentHarnessId, "halonic">,
  ): Promise<HarnessSignIn>;
  /**
   * Whether the agent's saved file is in the live version, for the "Changes not live yet" line.
   * Absent where the app can't tell, which shows no line. Rejects like {@link AgentsHost.read}.
   */
  liveState?(ref: AgentRef): Promise<AgentLiveState>;
  /**
   * Answers the person's latest message in the agent's Try it chat, with the agent as it's saved
   * now: its model, instructions and tools, at most its model call limit of turns (64 at most). It
   * is a chat turn outside any run (v0.1, HAL-902), so it records no run. A model or tool that
   * fails ends the answer as `failed` instead of rejecting, so the messages before it are kept.
   * Rejects with `denied` when the workspace may start nothing (not trusted), with `not_found` when
   * the agent isn't there, and with the reason the engine couldn't be opened.
   */
  answer(ref: AgentRef, request: AgentChatRequest): Promise<ChatAnswer>;
  /**
   * The agent's model when it needs an API key that isn't stored, for the line under the Try it
   * box (states H19); `undefined` when it can be used, when the agent runs in a program with its
   * own sign-in, or when the model isn't found (the workspace checks report that). Absent where
   * keys can't be asked, which shows no line. Rejects like {@link AgentsHost.read}.
   */
  missingModelKey?(ref: AgentRef): Promise<MissingModelKey | undefined>;
  /**
   * The monthly budget's sentence while this month's spend has reached it (states H21), else
   * `undefined`. Absent where the budget can't be read, which shows no line.
   */
  budgetReached?(): Promise<string | undefined>;
  /**
   * Makes the agent live: opens Create version with only this agent's file, and answers `"made"`
   * once the version is created, `"cancelled"` when the person closed it. Absent while the app
   * can't offer that, so the "Changes not live yet" line has no **Review and make live**. Rejects
   * with the reason the version couldn't be made, and like {@link AgentsHost.read}. With `name`,
   * Create version says it makes that agent live, and its toast says the agent is live.
   */
  makeLive?(ref: AgentRef, options?: { readonly name?: string }): Promise<"made" | "cancelled">;
  /**
   * Whether the workspace may start anything now: `false` while this computer doesn't trust it
   * (states H16). Absent where there is no folder to trust, which counts as yes.
   */
  mayStart?(): boolean;
  /**
   * Opens the workspace's one trust gate, and answers `"trusted"` once the person trusted the
   * workspace, `"declined"` on Not now. Absent where the gate can't be opened, so a Try it message
   * in a workspace that isn't trusted only says it wasn't started.
   */
  askTrust?(): Promise<"trusted" | "declined">;
  /**
   * Watches the assistant's changes to review that Try it uses and leaves out for this agent
   * (flow-assistant 4.4); returns the way to stop. Absent where there are none (the browser).
   */
  watchTryItChanges?(ref: AgentRef, listener: (changes: TryItChanges) => void): () => void;
  /** The workspace's name, for "Not started: *Acme* isn't trusted yet"; `undefined` before it's read. */
  workspaceName?(): string | undefined;
  /**
   * Where the workspace's chats are saved, so a Try it chat joins the Build chats' list
   * (flow-assistant 5.4) and comes back when the agent's page opens again. Absent where chats
   * aren't kept, so a Try it chat lives as long as its page.
   */
  readonly savedChats?: SavedChatsPlace | undefined;
  /**
   * Where the agent runs on this computer, from its saved file; `undefined` where Studio can't
   * choose it (no agent host, as in the browser). A choice is kept on this computer only, so it
   * never carries over to another one. Rejects like {@link AgentsHost.read}.
   */
  placement(ref: AgentRef): Promise<AgentPlacementState | undefined>;
  /**
   * Saves a person's choice, after the warning, to run the agent on this computer, for its file
   * with `shownFingerprint`, the one {@link AgentsHost.placement} gave when the warning opened.
   * When the file changed since, nothing is saved and the answer holds the new fingerprint. Only a
   * person's own confirm calls this. Rejects like {@link AgentsHost.read}, and where Studio can't
   * choose.
   */
  chooseThisComputer(ref: AgentRef, shownFingerprint: string): Promise<ThisComputerChoice>;
  /** Puts the agent back in its sandbox on this computer. Rejects like {@link AgentsHost.chooseThisComputer}. */
  chooseSandbox(ref: AgentRef): Promise<void>;
  /**
   * The path of the agent's file from the workspace folder, for **Open as file**. Rejects like
   * {@link AgentsHost.read}.
   */
  filePath(ref: AgentRef): Promise<string>;
  /**
   * Moves the agent's file to the trash as one change, with no dialog. Rejects with `not_found`
   * when the agent isn't there, and with the reason it couldn't. The workflows that run the agent
   * are left as they are and show an error until they name another one.
   */
  trash(ref: AgentRef): Promise<TrashedAgent>;
  /**
   * The name of an agent the host has read or made, for a tab or a page title, or `undefined`
   * before it has read it. Sync, because a tab is named the moment it opens.
   */
  nameOf(ref: AgentRef): string | undefined;
  /**
   * The workflows that run this agent in a task step, for the "used by" line and the warning
   * before a delete. Empty when none does. Rejects with the reason it couldn't read the workflows.
   */
  referencesTo(ref: AgentRef): Promise<readonly AgentUser[]>;
  /**
   * The routines that start this agent, in the workspace's order, for the agent map. Absent where
   * the app has no routines, which shows none. Rejects with the reason it couldn't read them.
   */
  routinesOf?(ref: AgentRef): Promise<readonly AgentRoutine[]>;
  /**
   * Calls `listener` each time the list may have changed (a file saved), and each time a Where it
   * runs choice is saved, so a page that shows whether an agent is on hold follows a confirm made
   * on the agent's page; returns the way to stop.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Makes an agent in the hub, with the id taken from its name (`-2` when the id is taken), and
   * returns where it is. Rejects with the reason it couldn't be written.
   */
  create(newAgent: NewAgent): Promise<AgentRef>;
}

/** The open workspace's agents, provided by the app (`agents.host`). */
export const AgentsHostService: ServiceKey<AgentsHost> = serviceKey<AgentsHost>("agents.host");

/**
 * Loads the Agents list, for the CI screenshots (`docs/guides/e2e-screenshots.md`), which draw it
 * with made-up data. The app never calls it: the feature registers the page itself.
 */
export const loadAgentsPage = () => import("./list/agents-page.tsx");

/**
 * Loads an agent's page, for the CI screenshot of the agent map (`docs/guides/e2e-screenshots.md`),
 * which draws it with made-up data. The app never calls it: the feature registers the page itself.
 */
export const loadAgentScreen = () => import("./page/agent-page.tsx");
