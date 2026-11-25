import type { Template, Tool, ToolActionName } from "@halonicjs/format";
import type { GitHubGet } from "./github.ts";
import type { Capability, RuntimeHost, ToolResult } from "./host.ts";
import { mergeTimesHandler } from "./pulls/merge-times.ts";
import { openPullRequestsHandler } from "./pulls/open-pull-requests.ts";
import { pullRequestHandler } from "./pulls/pull-request.ts";
import { failedRunsHandler } from "./runs/failed-runs.ts";
import { taskHandler } from "./tasks/task.ts";
import { templateHandler } from "./template-action.ts";

/**
 * The code behind each action a workspace tool can name (`TOOL_ACTIONS` in
 * `@halonicjs/format`). A handler is reviewed code in this package; a
 * workspace only picks one and fills in its settings. Adding a handler is a
 * security PR.
 */

/** What one call of an action gets. */
export interface ActionCall {
  /** The tool as the served snapshot defines it, with its action's settings. */
  readonly tool: Tool;
  /** The parameters the agent sent, unchecked. */
  readonly params: unknown;
  /** The served snapshot's templates, sorted by id; none when it has no list. */
  readonly templates: readonly Template[];
  /** The calling agent: its id, url key and display name. */
  readonly caller: { readonly agentId: string; readonly urlKey: string; readonly name: string };
  /** The company the call runs in. */
  readonly companyId: string;
  /** When the call started. */
  readonly now: Date;
  /**
   * Paperclip's read clients, and reading the runtime's own plugin state. A
   * handler may call only those its `capabilities` cover: Paperclip refuses
   * the rest.
   */
  readonly paperclip: Pick<RuntimeHost, "agents" | "issues"> & {
    readonly state: Pick<RuntimeHost["state"], "get">;
  };
  /** The GitHub reader with the plugin's read token: GET to api.github.com only. */
  readonly github: () => Promise<GitHubGet>;
}

/** One action's code and the Paperclip capabilities it needs beyond the runtime's own. */
export interface ActionHandler {
  readonly capabilities: readonly Capability[];
  readonly run: (call: ActionCall) => Promise<ToolResult>;
}

/** Handlers by action name. An action without one is off in this runtime. */
export type ActionHandlers = Readonly<Partial<Record<ToolActionName, ActionHandler>>>;

/**
 * The handlers the plugin worker ships with, one entry per action. Each
 * action moves here once its code is generic (plan HAL-17450, step 1b);
 * until then a tool that names it answers that it is off.
 */
export const runtimeHandlers: ActionHandlers = {
  "github.pull-request": pullRequestHandler,
  "github.open-pull-requests": openPullRequestsHandler,
  "paperclip.task": taskHandler,
  "paperclip.template": templateHandler,
  "paperclip.failed-runs": failedRunsHandler,
  "github.merge-times": mergeTimesHandler,
};
