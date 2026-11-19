/**
 * The services and types other features may use. Features import each other only through this
 * file. The app provides `AgentsHostService` for each open workspace; the Agents feature's list,
 * dialogs and page read it, and the Workflows feature reads `referencesTo` for its "used by" line.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

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

/** The programs an agent can run in: Halonic's own loop, Claude Code or Codex (the file's `harness`). */
export type AgentHarnessId = "halonic" | "claude-code" | "codex";

/** The harnesses in the order the Harness page lists them. */
export const agentHarnessIds: readonly AgentHarnessId[] = ["halonic", "claude-code", "codex"];

/**
 * Whether a harness can run on this computer, as the agent host's `detect()` finds it. `signed-out`
 * is for the agent's own settings folder; `failed` means the host found the program but its check
 * didn't work.
 */
export type HarnessReadiness =
  | { readonly status: "ready"; readonly version: string }
  | { readonly status: "signed-out"; readonly version: string }
  | { readonly status: "missing" }
  | { readonly status: "unsupported"; readonly version: string; readonly supported: string }
  | { readonly status: "failed"; readonly error: string };

/** What the Configuration pages show of an agent. */
export interface AgentSettings extends AgentListing {
  /** What the agent is told to do; empty before anyone writes it. */
  readonly instructions: string;
  /** The most model calls in one step of the agent (its model call limit); 6 when the file says none. */
  readonly maxSteps: number;
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
}

/**
 * Why an agent can't be a subagent, from the names along its {@link handOffPath}: "Sorter already
 * hands work to Mail triage", or "… to Mail triage through Writer" when work goes through others
 * on the way (flow-agents 5.4).
 */
export function alreadyHandsWork(names: readonly string[]): string {
  const [from = "", ...rest] = names;
  const to = rest.pop() ?? from;
  const through =
    rest.length === 0
      ? ""
      : ` through ${rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(", ")} and ${rest.at(-1)}`}`;
  return `${from} already hands work to ${to}${through}`;
}

/** An agent of a hub as the Subagents page sees it: its row and the agents it hands work to. */
export interface AgentTeamMember extends AgentListing {
  /** The ids of the agents of its hub it hands work to, in its file's order. */
  readonly subagents: readonly string[];
}

/**
 * The agents work goes through from `from` until it reaches `to`, both included, following each
 * agent's subagents; `undefined` when work from `from` never reaches `to`. Adding `from` as a
 * subagent of `to` closes a loop exactly when this finds a way, so the Subagents page and the
 * host's refusal ask the same question. The shortest way is found, and an agent is `[from]`.
 */
export function handOffPath(
  team: readonly AgentTeamMember[],
  from: string,
  to: string,
): readonly string[] | undefined {
  const subagentsOf = new Map(team.map((member) => [member.id, member.subagents]));
  const cameFrom = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    if (at === to) {
      const path = [at];
      for (let step = cameFrom.get(at); typeof step === "string"; step = cameFrom.get(step)) {
        path.unshift(step);
      }
      return path;
    }
    for (const next of subagentsOf.get(at) ?? []) {
      if (!cameFrom.has(next)) {
        cameFrom.set(next, at);
        queue.push(next);
      }
    }
  }
  return undefined;
}

/** The lists of the Tools page: what an agent uses of the Library. */
export type AgentToolList = "skills" | "knowledge" | "connectors";

/** The Tools page's lists, in the order it shows them. */
export const agentToolLists: readonly AgentToolList[] = ["skills", "knowledge", "connectors"];

/** A Library item an agent can be given: its id, as the agent's file names it, and its name. */
export interface AgentToolOption {
  readonly id: string;
  readonly name: string;
}

/** A change to an agent's settings; a field left out stays as it is. */
export interface AgentChange {
  /** The new display name. The id stays, and no other file changes. */
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly instructions?: string | undefined;
  /** The model alias, or `provider/model`. */
  readonly model?: string | undefined;
  /** The model call limit, a whole number from 1 to 200. */
  readonly maxSteps?: number | undefined;
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
   * Puts the agent back. It is the workspace's undo, so it works only while the delete is still the
   * newest change; after any other change it rejects with `conflict` and undoes nothing.
   */
  undo(): Promise<void>;
}

/** A workflow that runs an agent in one of its task steps. */
export interface AgentUser {
  readonly hubId: string;
  /** The workflow's id. */
  readonly id: string;
  /** The workflow's display name. */
  readonly name: string;
  /** How many of the workflow's steps run the agent: one or more. */
  readonly steps: number;
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
   * isn't there, with `invalid_input` when the name is empty, with `conflict` when a new subagent
   * would close a loop (its message names who already hands work to whom), and with the reason it
   * couldn't write.
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
   * Calls `listener` each time the list may have changed (a file saved); returns the way to stop.
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
