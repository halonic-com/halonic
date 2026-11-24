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

/** What one action is, for the people who write and review tool files. */
export interface ToolActionInfo {
  /** One line on what the action does. */
  readonly about: string;
  /** Whether the action changes anything. None does yet: writing actions come with their own review. */
  readonly writes: boolean;
  /** The keys the installer fills in for it. */
  readonly keys: readonly ActionKey[];
}

/**
 * Every action, with the settings a tool file gives it under `action.with`.
 * Settings are workspace data (which repositories, how many days), never a
 * key. Each settings map refuses keys it doesn't know. `with` may be left
 * out only for an action whose settings all have defaults.
 */
export const TOOL_ACTIONS = {
  "github.pull-request": {
    about:
      "Reads one pull request: its checks, whether it can merge, and its place in the merge queue.",
    writes: false,
    keys: ["github-read"],
    settings: s.object({ repositories }).strict(),
  },
  "github.open-pull-requests": {
    about: "Lists the open pull requests whose branch starts with the caller's name.",
    writes: false,
    keys: ["github-read"],
    settings: s.object({ repositories }).strict(),
  },
  "github.merge-queue": {
    about: "Reads the merge queue of the listed repositories.",
    writes: false,
    keys: ["github-read"],
    settings: s.object({ repositories }).strict(),
  },
  "github.merge-times": {
    about: "Reads how long pull requests took to merge over the last days.",
    writes: false,
    keys: ["github-read"],
    settings: s.object({ repositories, days: s.number().int().min(1).max(90).default(7) }).strict(),
  },
  "paperclip.task": {
    about: "Reads one Paperclip task: its status, holder, blockers, documents and newest comments.",
    writes: false,
    keys: ["paperclip-api"],
    settings: s.object({}).strict().prefault({}),
  },
  "paperclip.failed-runs": {
    about: "Lists the agent runs that failed over the last hours.",
    writes: false,
    keys: ["paperclip-api"],
    settings: s
      .object({ hours: s.number().int().min(1).max(168).default(24) })
      .strict()
      .prefault({}),
  },
} as const;

/** An action's name, such as `github.pull-request`. */
export type ToolActionName = keyof typeof TOOL_ACTIONS;

/** Every action's name, in the order of the list. */
export function toolActionNames(): ToolActionName[] {
  return Object.keys(TOOL_ACTIONS) as ToolActionName[];
}

/**
 * What an action does, which keys it needs and whether it writes.
 *
 * @param name - the action's name from a tool file
 * @returns its description, without its settings schema
 *
 * @example
 * toolActionInfo("paperclip.task").keys; // ["paperclip-api"]
 */
export function toolActionInfo(name: ToolActionName): ToolActionInfo {
  const { about, writes, keys } = TOOL_ACTIONS[name];
  return { about, writes, keys };
}
