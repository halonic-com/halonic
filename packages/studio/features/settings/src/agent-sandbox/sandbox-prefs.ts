import { hostSetting } from "@halonicjs/app";

/** Where an agent made from now on runs: in the sandbox, or on this computer without one. */
export type NewAgentsRun = "sandbox" | "this-computer";

/**
 * The sandbox's host setting (`settings.new-agents-run`): kept where Halonic runs, for every
 * workspace on the computer, never in a workspace. A value that can't be read reads as the
 * sandbox, so a damaged file never moves an agent out of it.
 */
export const sandboxPrefs = {
  newAgents: hostSetting<NewAgentsRun>(
    "sandbox.new-agents",
    "sandbox",
    (value): value is NewAgentsRun => value === "sandbox" || value === "this-computer",
  ),
};
