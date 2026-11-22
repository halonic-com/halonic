import { tauriAgentHostTransport } from "@halonicjs/studio-services";
import { type DesktopUnfencedRuns, windowUnfencedRuns } from "../plugins/unfenced-runs.ts";

/**
 * The agent host's word on whether integration code runs in the sandbox, and the way to save the
 * person's yes to run it without, for the workspace trust check's Integrations section: the same
 * object the plugin check and Settings › Agent sandbox use (`studio.desktop-unfenced-runs`).
 * `undefined` without an agent host.
 */
export function unfencedRunsOf(window: object): DesktopUnfencedRuns | undefined {
  const transport = tauriAgentHostTransport(window);
  return transport === undefined ? undefined : windowUnfencedRuns(window, transport);
}
