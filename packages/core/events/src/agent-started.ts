/**
 * How a harness program's session began for an agent (requirement
 * `events.agent-started-session`): `fresh`, with a short code saying why it
 * didn't resume, such as `no-session`; or `resumed` from an earlier session.
 * The harness bridge chooses the codes, so a reader counts whatever it finds
 * and never refuses an unknown one.
 */
export type AgentSessionStart =
  | { readonly start: "fresh"; readonly reason: string }
  | { readonly start: "resumed" };

/**
 * An agent started on a step. `parent`: the agent that delegated this one
 * (sub-agents); absent for the state's own agent. `session`: how its harness
 * session began; absent for Halonic's own loop and in older logs.
 */
export interface AgentStartedEvent {
  type: "agent.started";
  state: string;
  agent: string;
  prompt: string;
  parent?: string;
  session?: AgentSessionStart;
}
