import { type NewAgentsRun, newAgentsRun } from "@halonicjs/app";

export type { NewAgentsRun };

/**
 * The sandbox's host setting (`sandbox.new-agents`): kept where Halonic runs, for every
 * workspace on the computer, never in a workspace. A value that can't be read reads as the
 * sandbox, so a damaged file never moves an agent out of it. The engine's creation path reads
 * the same definition (`newAgentPlacement`).
 */
export const sandboxPrefs = {
  newAgents: newAgentsRun,
};
