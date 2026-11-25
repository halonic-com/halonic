// The actions a workspace tool can run (plan HAL-17450 rev 5, "The plugin
// builder" and "Safety"). An action is reviewed code in the plugin runtime
// that ships with Halonic; a tool file only picks one and fills in its
// settings. This list is the whole set: a workspace can't add to it, so a
// tool can never give itself a power the runtime doesn't already have.
// Adding an action is a security PR (Julian and Liam).
import { s } from "@halonicjs/schema-kit";

/**
 * A key the plugin's installer gives the action, as a secret reference in
 * the plugin's settings. The workspace never names, holds or passes one; it
 * only learns, through the action, which ones a tool needs.
 *
 * - `github-read`: a GitHub token that can read the listed repositories.
 * - `paperclip-api`: the plugin's own Paperclip API access.
 *
 * An action that only reads the snapshot, such as `paperclip.template`, needs none.
 */
export type ActionKey = "github-read" | "paperclip-api";

/** A GitHub repository as `owner/name`, such as `acme/website`. */
const repository = s
  .string()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/,
    "write the repository as owner/name, such as 'acme/website'",
  );

/** The repositories a GitHub action may read. Any other is refused at run time. */
const repositories = s.array(repository).min(1).max(20);

/** The most agents one budget list names. */
export const MAX_BUDGET_AGENTS = 500;

/** An agent's url key in Paperclip, such as `mateo` or `ravi-2`. */
const agentUrlKey = s
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "write the agent's url key, such as 'mateo'");

/**
 * A monthly budget in dollars, such as `50` or `12.5`: whole cents, at
 * most 100,000 dollars. Paperclip keeps budgets in cents, so a third
 * decimal couldn't be compared.
 */
const monthlyDollars = s
  .number()
  .min(0)
  .max(100_000)
  .refine(
    (dollars) => Math.abs(Math.round(dollars * 100) - dollars * 100) < 1e-6,
    "give at most two decimals, such as 50 or 12.5",
  );

/** What each agent's monthly budget should be, by url key. */
const agentBudgets = s
  .record(agentUrlKey, monthlyDollars)
  .refine(
    (budgets) => Object.keys(budgets).length <= MAX_BUDGET_AGENTS,
    `name at most ${MAX_BUDGET_AGENTS} agents`,
  );

/**
 * Whether a writing action writes (`write`) or only answers what it would
 * write (`dry-run`, the default). Only the tool file sets it, never the
 * agent's call: a new writing tool starts in dry run for one pass.
 */
const WriteMode = s.enum(["dry-run", "write"]);

/** The settings every writing action takes. */
const writeSettings = s
  .object({ mode: WriteMode.default("dry-run") })
  .strict()
  .prefault({});

/**
 * A parameter an action reads from the agent's call. The tool file declares
 * it under `parameters` with this name; the action reads no other.
 */
export interface ActionParameter {
  /** Its name, such as `pr`. */
  readonly name: string;
  /** Whether the action can't run without it, so every tool file for the action must declare it. */
  readonly required: boolean;
}

/** What one action is, for the people who write and review tool files. */
export interface ToolActionInfo {
  /** One line on what the action does. */
  readonly about: string;
  /** Whether the action changes anything. A writing action has a `mode` and starts in dry run. */
  readonly writes: boolean;
  /** The keys the installer fills in for it. */
  readonly keys: readonly ActionKey[];
  /** The parameters it reads from the agent's call, required ones first. */
  readonly parameters: readonly ActionParameter[];
}

const none: readonly ActionParameter[] = [];

/**
 * Every action, with the settings a tool file gives it under `action.with`.
 * Settings are workspace data (which repositories, how many days), never a
 * key. Each settings map refuses keys it doesn't know. `with` may be left
 * out only for an action whose settings all have defaults. `parameters` are
 * the names the action's code reads from the agent's call: the runtime's
 * tests hold each handler to them.
 */
export const TOOL_ACTIONS = {
  "github.pull-request": {
    about:
      "Reads one pull request: its checks, whether it can merge, and its place in the merge queue.",
    writes: false,
    keys: ["github-read"],
    parameters: [
      { name: "pr", required: true },
      { name: "repo", required: false },
    ],
    settings: s.object({ repositories }).strict(),
  },
  "github.open-pull-requests": {
    about: "Lists the open pull requests whose branch starts with the caller's name.",
    writes: false,
    keys: ["github-read"],
    parameters: none,
    settings: s.object({ repositories }).strict(),
  },
  "github.merge-queue": {
    about: "Reads the merge queue of the listed repositories.",
    writes: false,
    keys: ["github-read"],
    parameters: none,
    settings: s.object({ repositories }).strict(),
  },
  "github.merge-times": {
    about: "Reads how long pull requests took to merge over the last days.",
    writes: false,
    keys: ["github-read"],
    parameters: none,
    settings: s.object({ repositories, days: s.number().int().min(1).max(90).default(7) }).strict(),
  },
  "paperclip.task": {
    about: "Reads one Paperclip task: its status, holder, blockers, documents and newest comments.",
    writes: false,
    keys: ["paperclip-api"],
    parameters: [
      { name: "task", required: true },
      { name: "comments", required: false },
      { name: "document", required: false },
    ],
    settings: s.object({}).strict().prefault({}),
  },
  "paperclip.failed-runs": {
    about: "Lists the agent runs that failed over the last hours.",
    writes: false,
    keys: ["paperclip-api"],
    parameters: [{ name: "since", required: false }],
    settings: s
      .object({ hours: s.number().int().min(1).max(168).default(24) })
      .strict()
      .prefault({}),
  },
  "paperclip.budgets": {
    about:
      "Compares each agent's monthly budget in Paperclip with the one the workspace sets, and flags the differences. Changes nothing.",
    writes: false,
    keys: ["paperclip-api"],
    parameters: none,
    settings: s.object({ agents: agentBudgets }).strict(),
  },
  "paperclip.template": {
    about:
      "Reads one of the workspace's templates by its id, or lists them all when no id is given.",
    writes: false,
    keys: [],
    parameters: [{ name: "id", required: false }],
    settings: s.object({}).strict().prefault({}),
  },
  "paperclip.comment": {
    about: "Posts one comment on a task in the caller's company, with the caller as its author.",
    writes: true,
    keys: ["paperclip-api"],
    parameters: [
      { name: "task", required: true },
      { name: "body", required: true },
    ],
    settings: writeSettings,
  },
  "paperclip.next-step": {
    about:
      "Sets the caller's own task to in progress with a monitor, or to blocked with its blockers, with a comment.",
    writes: true,
    keys: ["paperclip-api"],
    parameters: [
      { name: "task", required: true },
      { name: "status", required: true },
      { name: "comment", required: true },
      { name: "monitor", required: false },
      { name: "monitorInMinutes", required: false },
      { name: "monitorRef", required: false },
      { name: "monitorService", required: false },
      { name: "monitorMaxChecks", required: false },
      { name: "blockedBy", required: false },
    ],
    settings: writeSettings,
  },
  "paperclip.finish-run": {
    about: "Ends the caller's run on its own task: done, blocked, or handed to another agent.",
    writes: true,
    keys: ["paperclip-api"],
    parameters: [
      { name: "task", required: true },
      { name: "outcome", required: true },
      { name: "comment", required: true },
      { name: "to", required: false },
      { name: "blockedBy", required: false },
    ],
    settings: writeSettings,
  },
} as const;

/** How a writing action runs. */
export type WriteModeName = "dry-run" | "write";

/** An action's name, such as `github.pull-request`. */
export type ToolActionName = keyof typeof TOOL_ACTIONS;

/** Every action's name, in the order of the list. */
export function toolActionNames(): ToolActionName[] {
  return Object.keys(TOOL_ACTIONS) as ToolActionName[];
}

/**
 * What an action does, which keys it needs, which parameters it reads and
 * whether it writes.
 *
 * @param name - the action's name from a tool file
 * @returns its description, without its settings schema
 *
 * @example
 * toolActionInfo("paperclip.task").keys; // ["paperclip-api"]
 */
export function toolActionInfo(name: ToolActionName): ToolActionInfo {
  const { about, writes, keys, parameters } = TOOL_ACTIONS[name];
  return { about, writes, keys, parameters };
}
