// The agents' own sign-ins, for the Harnesses line of `halonic doctor`
// (HAL-5649). A run signs in with the agent's settings folder, never the
// person's own, so `doctor` asks each harness about each agent's folder and
// names the agents that need to sign in, with the command that does it.

import type { Harness } from "@halonicjs/ports";
import type { DetectedHarness, SignedOutAgent } from "./doctor-checks.ts";

/** A harness, as far as `doctor` asks it. */
export type DoctorHarness = Pick<Harness, "id" | "name" | "detect" | "signIn">;

/** An agent of the workspace that runs in a harness, with that harness's settings folder for it. */
export interface AgentSettingsFolder {
  /** The agent's name as a person reads it, such as "Writer". */
  agent: string;
  /** The value of `harness` in the agent's file, such as "claude-code". */
  harness: string;
  /** Where the harness keeps the agent's own settings, its sign-in among them. */
  settingsFolder: string;
}

/**
 * The agents whose harness says no one is signed in in their own settings
 * folder, in the agents' order (requirement `app.doctor-agent-sign-in`).
 *
 * Only a harness with a sign-in of its own is asked, and only when its
 * program is installed in a version Halonic supports: otherwise the
 * Harnesses line already names that problem, and signing in wouldn't help.
 * Each agent is asked once, all at the same time.
 *
 * @param harnesses every harness Halonic can start other than its own
 * @param detected what each harness's `detect()` found, without an agent's folder
 * @param agents the agents to ask about
 *
 * @example
 * await signedOutAgents(harnesses, detected, [
 *   { agent: "Writer", harness: "claude-code", settingsFolder: "/data/settings/writer" },
 * ]);
 * // [{ agent: "Writer", harness: "claude-code", name: "Claude Code", signIn, settingsFolder }]
 */
export async function signedOutAgents(
  harnesses: readonly DoctorHarness[],
  detected: readonly DetectedHarness[],
  agents: readonly AgentSettingsFolder[],
): Promise<SignedOutAgent[]> {
  const runnable = new Set(
    detected
      .filter(({ detection }) => detection.status === "ready" || detection.status === "signed-out")
      .map(({ id }) => id),
  );
  const answers = await Promise.all(
    agents.map(async (agent): Promise<SignedOutAgent[]> => {
      const harness = harnesses.find((each) => each.id === agent.harness);
      if (harness?.signIn === undefined || !runnable.has(harness.id)) return [];
      const found = await harness.detect({ settingsFolder: agent.settingsFolder });
      if (found.status !== "signed-out") return [];
      return [{ ...agent, name: harness.name, signIn: harness.signIn }];
    }),
  );
  return answers.flat();
}
