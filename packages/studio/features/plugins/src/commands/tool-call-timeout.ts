import { noAnswerReason } from "./command-text.ts";
import type { PluginToolCaller } from "./plugin-command-dialog.tsx";

/** How long a command's tool call may take before it fails: 30 seconds. */
export const TOOL_CALL_TIMEOUT_MS = 30_000;

/**
 * A tool caller whose calls fail when the tool doesn't answer within `ms`. A command's dialog
 * can't be closed while it runs, so a call that never answers would hold it open; this one fails
 * with "the plugin didn't answer in 30 seconds", and the dialog offers Try again. An answer that
 * comes later is dropped.
 *
 * @example
 * const caller = timedToolCaller(pluginTools);
 */
export function timedToolCaller(
  caller: PluginToolCaller,
  ms: number = TOOL_CALL_TIMEOUT_MS,
): PluginToolCaller {
  return {
    call: (plugin, tool, args) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(noAnswerReason(ms))), ms);
        caller.call(plugin, tool, args).then(
          (answer) => {
            clearTimeout(timer);
            resolve(answer);
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      }),
  };
}
