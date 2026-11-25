import type { Tool, ToolActionName } from "@halonicjs/format";
import type { GitHubGet } from "./github.ts";
import type { Capability, ToolResult } from "./host.ts";
import { openPullRequestsHandler } from "./pulls/open-pull-requests.ts";
import { pullRequestHandler } from "./pulls/pull-request.ts";

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
  /** The calling agent: its id and url key. */
  readonly caller: { readonly agentId: string; readonly urlKey: string };
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
};
