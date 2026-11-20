import type { ServerResponse } from "node:http";
import { sendError } from "../server/host-server.ts";

/**
 * Why the host won't run a plugin's backend for a call, as the answer's
 * `error` names it. Each one starts nothing.
 *
 * - `plugin_not_trusted`: the host's own trust record doesn't cover the plugin as it is in its folder now.
 * - `not_fenced`: the sandbox that fences a plugin isn't available on this computer, such as Windows before HAL-3403.
 * - `not_in_this_build`: the shipped single executable has no runner mode yet, so it starts no plugin backend.
 * - `too_many_plugins`: the table already holds the most plugins it allows.
 * - `host_stopping`: the host is stopping and starts no more plugins.
 */
export type PluginRefusalCode =
  | "plugin_not_trusted"
  | "not_fenced"
  | "not_in_this_build"
  | "too_many_plugins"
  | "host_stopping";

/** The host refused to run a plugin's backend for a call; the route answers it with the code's fixed message. */
export class PluginRefusal extends Error {
  override readonly name = "PluginRefusal";
  readonly code: PluginRefusalCode;

  constructor(code: PluginRefusalCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
  }
}

const refusals: Record<PluginRefusalCode, { status: number; message: string }> = {
  plugin_not_trusted: {
    status: 403,
    message:
      "This computer's trust record doesn't cover this plugin as it is now. Review it and trust it first.",
  },
  not_fenced: {
    status: 403,
    message:
      "Plugin tools can't run on this computer yet: the sandbox that fences a plugin isn't available here.",
  },
  not_in_this_build: {
    status: 403,
    message: "Plugin tools aren't available in this build of the agent host yet.",
  },
  too_many_plugins: {
    status: 429,
    message: "The agent host already runs the most plugins it allows. Try again in a moment.",
  },
  host_stopping: {
    status: 503,
    message: "The agent host is stopping and starts no more plugins.",
  },
};

/** Answers a refusal with its status and the code's fixed message. */
export function sendRefusal(response: ServerResponse, refusal: PluginRefusal): void {
  const { status, message } = refusals[refusal.code];
  sendError(response, status, refusal.code, message);
}
