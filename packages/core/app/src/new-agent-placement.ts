// Where a new agent runs, from the host setting `sandbox.new-agents` that
// Settings › Agent sandbox saves (HAL-9451). Only a person's choice in
// Settings moves a new agent out of its sandbox, and anything that can't be
// read leaves it in.

import { ok, type Result } from "@halonicjs/std";
import type { AgentPlacement, PlacementRefusal, PlacementSubject } from "./agent-placement.ts";
import { type HostSetting, type HostSettings, hostSetting } from "./host-settings.ts";

/** Where an agent made from now on runs: in the sandbox, or on this computer without one. */
export type NewAgentsRun = "sandbox" | "this-computer";

/**
 * The host setting for where new agents run (`sandbox.new-agents`): kept
 * where Halonic runs, for every workspace on the computer, never in a
 * workspace. A value that can't be read reads as the sandbox.
 */
export const newAgentsRun: HostSetting<NewAgentsRun> = hostSetting<NewAgentsRun>(
  "sandbox.new-agents",
  "sandbox",
  (value): value is NewAgentsRun => value === "sandbox" || value === "this-computer",
);

/**
 * Applies the "New agents run" setting to an agent that was just made: when
 * it says `this-computer`, records that choice for the agent's file as it is
 * now. Any other value, settings that aren't loaded and a read that fails
 * leave the agent in its sandbox, as `AgentPlacement.where` does for a
 * choice it can't read.
 *
 * It has no caller yet: the path that creates agents will call it (HAL-9509).
 * Don't remove it as unused.
 *
 * @example
 * const run = await newAgentPlacement(settings, placement, { location, agent: "coder", file });
 */
export async function newAgentPlacement(
  settings: HostSettings,
  placement: AgentPlacement,
  subject: PlacementSubject,
): Promise<Result<NewAgentsRun, PlacementRefusal>> {
  let wanted: NewAgentsRun = "sandbox";
  try {
    wanted = settings.get(newAgentsRun);
  } catch {
    // Not loaded, such as after a read that failed: the sandbox.
  }
  if (wanted !== "this-computer") return ok("sandbox");
  const shown = await placement.where(subject);
  const chosen = await placement.chooseThisComputer(subject, shown.agentFingerprint);
  return chosen.ok ? ok("this-computer") : chosen;
}
