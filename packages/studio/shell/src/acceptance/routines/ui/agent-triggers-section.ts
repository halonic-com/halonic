import type { AgentsApi } from "../../agents/api.ts";

/** Stands in for the Triggers section on the agent page; a real feature exports a React component. */
export function AgentTriggersSection(agents: AgentsApi, agentId: string): string {
  return `triggers for ${agentId} (one of ${agents.names().length} agents)`;
}
