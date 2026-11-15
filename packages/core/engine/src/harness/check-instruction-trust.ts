// The instruction trust check of a harness start (`engine.harness-instructions-trust`):
// a run whose instructions a person hasn't trusted doesn't start, and the
// refusal says why.

import type { InstructionTrustCheck } from "@halonicjs/app";
import { escapeHidden } from "@halonicjs/std";
import type {
  HarnessAgent,
  HarnessInstructionsPin,
  HarnessInstructionTrust,
} from "./harness-host.ts";

/** How many file names of one kind a refusal lists before it says how many more there are. */
const namesShown = 10;

/** The run's instructions aren't trusted, so the harness didn't start; the message says what a person must look at. */
export class InstructionsNotTrustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstructionsNotTrustedError";
  }
}

/**
 * Asks the host's trust check about the instructions the run starts with.
 * Without a trust check on the host, or without instruction files, nothing
 * is asked.
 *
 * @throws InstructionsNotTrustedError when the check answers `ask`
 */
export async function checkInstructionTrust(
  trust: HarnessInstructionTrust | undefined,
  agent: HarnessAgent,
  pin: HarnessInstructionsPin | null,
): Promise<void> {
  if (trust === undefined || pin === null) return;
  const check = await trust.service.check(
    { location: trust.location, agent: agent.agentId },
    {
      digest: pin.sha256,
      files: Object.fromEntries(pin.files.map((file) => [file.path, file.sha256])),
    },
  );
  if (check.kind === "trusted") return;
  throw new InstructionsNotTrustedError(refusalText(agent.agentId, check));
}

function refusalText(
  agentId: string,
  check: Exclude<InstructionTrustCheck, { kind: "trusted" }>,
): string {
  const { added, removed, changed } = check.changes;
  const parts = [
    `Halonic didn't start agent ${quoted(agentId)}: a person hasn't trusted its instructions yet.`,
  ];
  if (check.unreadable !== undefined) {
    parts.push(`What was trusted before can't be used: ${quoted(check.unreadable)}.`);
  }
  for (const [label, names] of [
    ["Added", added],
    ["Changed", changed],
    ["Removed", removed],
  ] as const) {
    if (names.length > 0) parts.push(`${label}: ${listOf(names)}.`);
  }
  parts.push("Trust the instructions, then run again.");
  return parts.join(" ");
}

/** File names are text from the workspace: quoted and escaped, so one can't end the sentence or pose as another part of it. */
function quoted(text: string): string {
  return escapeHidden(JSON.stringify(text));
}

function listOf(names: readonly string[]): string {
  const shown = names.slice(0, namesShown).map(quoted).join(", ");
  const more = names.length - namesShown;
  return more > 0 ? `${shown} and ${more} more` : shown;
}
