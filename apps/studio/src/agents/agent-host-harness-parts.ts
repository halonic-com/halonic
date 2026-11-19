import { AgentHostHarness, type AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import type {
  AgentHarnessId,
  AgentRef,
  HarnessReadiness,
  HarnessSignIn,
} from "@halonicjs/studio-feature-agents/api";

/** What {@link WorkspaceAgents} asks the agent host about an agent's harness. */
export interface AgentHostHarnessParts {
  /** Whether the harness can run for this agent, signed in in its own settings folder. */
  detectHarness(ref: AgentRef, harness: AgentHarnessId): Promise<HarnessReadiness>;
  /** Opens the harness's own sign-in for this agent, in its own settings folder. */
  openSignIn(ref: AgentRef, harness: AgentHarnessId): Promise<HarnessSignIn>;
}

/**
 * The agent host's harness checks for the agents of one workspace. Each agent signs in in its own
 * settings folder, which only the host knows (HAL-6351), so both ask the host for it first.
 *
 * @param workspace - the workspace folder, which the launcher named to the host
 *
 * @example
 * const parts = agentHostHarnessParts(transport, location);
 * await parts.detectHarness({ hubId: "acme", id: "writer" }, "claude-code"); // { status: "signed-out", version: "2.1.0" }
 */
export function agentHostHarnessParts(
  transport: AgentHostTransport,
  workspace: string,
): AgentHostHarnessParts {
  const harnessOf = (harness: AgentHarnessId) =>
    new AgentHostHarness(
      transport,
      { id: harness, name: harness },
      { bridgeIdOf: () => undefined, environments: {} },
    );
  return {
    async detectHarness(ref, harness) {
      const stand = harnessOf(harness);
      return stand.detect({ settingsFolder: await stand.settingsFolderOf(workspace, ref.id) });
    },
    async openSignIn(ref, harness) {
      const stand = harnessOf(harness);
      return stand.openSignIn(await stand.settingsFolderOf(workspace, ref.id));
    },
  };
}
