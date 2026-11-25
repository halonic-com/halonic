import type { ModelProblem } from "../api.ts";

/**
 * The words of the Chat with and Model chips and of an agent chat (flow-assistant 5.2, 5.3, 6.1;
 * UX checklist T14 1.4). The agent chat's box and start copy the Try it chat's (states H2).
 */
export const chatWithWords = {
  chatWith: "Chat with:",
  /** The chip's value for a Build chat. */
  build: "Build",
  /** The menu's first entry (parity name). */
  buildTheWorkspace: "Build the workspace",
  model: "Model:",
  /** New (HAL-18075): the Model chip's value while no model is set or read yet. */
  noModel: "none",
  /** An agent chat's model, as plain text: "Model: smart (Triage's)". */
  agentModel: (alias: string, agent: string) => `Model: ${alias} (${agent}'s)`,
  /** Why a model can't be used, as the Model menu's description of it. */
  problem: (problem: ModelProblem): string =>
    problem.kind === "needs-key"
      ? `Needs a key for ${problem.provider}`
      : `${problem.workspace} is local only`,
  /** An agent chat's empty start, box and transcript. */
  heading: (agent: string) => `Chat with ${agent}`,
  boxLabel: (agent: string) => `Message ${agent}`,
  placeholder: (agent: string) => `Message ${agent}…`,
  /** The agent's state words next to its orb in an agent chat's header (flow-agents 4.2, parity). */
  state: {
    think: "thinking…",
    talk: "replying…",
    tool: (tool: string) => `using ${tool}…`,
    idle: "idle",
  },
} as const;
