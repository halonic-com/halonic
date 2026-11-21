import { AgentHostUnfencedRuns } from "@halonicjs/adapter-agent-host-client";
import type { UnfencedRunStatus } from "@halonicjs/studio-feature-plugins/api";
import { tauriAgentHostTransport } from "@halonicjs/studio-services";

/**
 * The agent host's word on whether integration code runs in the sandbox, for the workspace trust
 * check's Runs rows: the same status the plugin check reads. `undefined` without an agent host.
 */
export function runsStatusOf(window: object): (() => Promise<UnfencedRunStatus>) | undefined {
  const transport = tauriAgentHostTransport(window);
  if (transport === undefined) return undefined;
  const routes = new AgentHostUnfencedRuns(transport);
  return () => routes.status();
}
