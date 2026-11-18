import { AgentHostHarness, type AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import type { AgentHarnessId, HarnessReadiness } from "@halonicjs/studio-feature-agents/api";

/**
 * Asks the agent host whether a harness can run, for {@link WorkspaceAgents}. It names no settings
 * folder yet, so the host reports the program's own state; `signed-out` comes with "Sign in for
 * this agent" (HAL-6351).
 *
 * @example
 * const detect = agentHostHarnessDetect(transport);
 * await detect("claude-code"); // { status: "ready", version: "2.1.0" }
 */
export function agentHostHarnessDetect(
  transport: AgentHostTransport,
): (harness: AgentHarnessId) => Promise<HarnessReadiness> {
  return (harness) =>
    new AgentHostHarness(
      transport,
      { id: harness, name: harness },
      { bridgeIdOf: () => undefined, environments: {} },
    ).detect();
}
