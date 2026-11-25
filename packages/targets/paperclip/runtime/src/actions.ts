import {
  type ActionKey,
  type ToolActionName,
  toolActionInfo,
  toolActionNames,
} from "@halonicjs/format";
import { type ActionHandlers, runtimeHandlers } from "./handlers.ts";
import type { Capability } from "./host.ts";

/**
 * The runtime's actions as data, for the plugin builder: which ones this
 * runtime can run and the Paperclip capabilities a plugin needs for them.
 * The builder reads this list instead of looking into `worker.js`. Its own
 * entry point (`@halonicjs/target-paperclip-runtime/actions`), so the CLI
 * gets it without the worker's code.
 */

/**
 * What every plugin the runtime runs needs: registering its tools, knowing
 * the caller, keeping the last good snapshot and its stale metric, and
 * reading a pinned snapshot from GitHub with the read token.
 */
export const runtimeCapabilities: readonly Capability[] = [
  "agent.tools.register",
  "agents.read",
  "plugin.state.read",
  "plugin.state.write",
  "metrics.write",
  "http.outbound",
  "secrets.read-ref",
];

/** One action as the builder sees it. */
export interface PluginAction {
  readonly name: ToolActionName;
  readonly about: string;
  readonly writes: boolean;
  /** The keys the installer fills in for it, as secret references. */
  readonly keys: readonly ActionKey[];
  /** Whether this runtime has its code. The builder refuses a tool whose action isn't available. */
  readonly available: boolean;
  /** The capabilities the action needs beyond `runtimeCapabilities`. */
  readonly capabilities: readonly Capability[];
}

/**
 * Every action the format knows, in its order, with whether this runtime can
 * run it.
 *
 * @example
 * pluginActions().filter((action) => action.available); // what a built plugin can serve
 */
export function pluginActions(handlers: ActionHandlers = runtimeHandlers): PluginAction[] {
  return toolActionNames().map((name) => {
    const handler = handlers[name];
    return {
      name,
      ...toolActionInfo(name),
      available: handler !== undefined,
      capabilities: handler?.capabilities ?? [],
    };
  });
}
