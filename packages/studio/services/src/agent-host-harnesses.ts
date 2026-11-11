import {
  type AgentHostHarness,
  type AgentHostHarnessOptions,
  type AgentHostTransport,
  agentHostHarnesses,
  type HarnessEnvironment,
} from "@halonicjs/adapter-agent-host-client";
import { claudeCodeEnvironment } from "@halonicjs/adapter-harness-claude-code/environment";
import { codexEnvironment } from "@halonicjs/adapter-harness-codex/environment";

/**
 * Each harness's own `environment` function, by the id the agent host lists
 * it under. These run on the page, not in the host: they only read the
 * bridge and the profile's folders. A harness without an entry here runs
 * without extra environment variables.
 */
export const harnessEnvironments: Readonly<Record<string, HarnessEnvironment>> = {
  "claude-code": claudeCodeEnvironment,
  codex: codexEnvironment,
};

/**
 * The engine's harnesses as the Studio gets them from the agent host: one
 * stand-in per harness the host lists, each with its own `environment`
 * from {@link harnessEnvironments}.
 *
 * @throws {@link AgentHostError} when the host refuses, or can't be reached
 */
export function studioHarnesses(
  transport: AgentHostTransport,
  bridgeIdOf: AgentHostHarnessOptions["bridgeIdOf"],
): Promise<AgentHostHarness[]> {
  return agentHostHarnesses(transport, { bridgeIdOf, environments: harnessEnvironments });
}
