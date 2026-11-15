// The instruction trust check of a harness start (`engine.harness-instructions-trust`):
// a run whose instructions a person hasn't trusted doesn't start, and the
// refusal says why.

import type { InstructionTrustCheck } from "@halonicjs/app";
import type { InstructionsRefusal } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import type {
  HarnessAgent,
  HarnessInstructionsPin,
  HarnessInstructionTrust,
} from "./harness-host.ts";
import { type StartLimits, seconds } from "./start-limits.ts";

/** How many file names of one kind a refusal lists before it says how many more there are. */
const namesShown = 10;

/**
 * The run's instructions aren't trusted, so the harness didn't start; the
 * message says what a person must look at. `runFailureReasonOf` turns it into
 * the run failure `instructions-not-trusted` with the agent and `refusal`, so
 * a page can offer to trust exactly the pin the check saw (requirement
 * `engine.run-failure-reason-of`).
 */
export class InstructionsNotTrustedError extends Error {
  override readonly name = "InstructionsNotTrustedError";
  /** The agent that didn't start. */
  readonly agent: string;
  readonly refusal: InstructionsRefusal;

  constructor(message: string, agent: string, refusal: InstructionsRefusal) {
    super(message);
    this.agent = agent;
    this.refusal = refusal;
  }
}

/** How long the host's trust check may take, and what enforces it. */
export interface TrustCheckLimit {
  readonly limits: StartLimits;
  readonly timeoutMs: number;
}

/**
 * Asks the host's trust check about the instructions the run starts with.
 * Without a trust check on the host, or without instruction files, nothing
 * is asked. A check that doesn't answer in time, or that throws, refuses the
 * start: a store that hangs never lets a run through, and never stalls it.
 *
 * @throws InstructionsNotTrustedError when the check answers `ask`, or doesn't answer within the limit
 * @throws what the check throws
 */
export async function checkInstructionTrust(
  trust: HarnessInstructionTrust | undefined,
  agent: HarnessAgent,
  pin: HarnessInstructionsPin | null,
  { limits, timeoutMs }: TrustCheckLimit,
): Promise<void> {
  if (trust === undefined || pin === null) return;
  const key = { location: trust.location, agent: agent.agentId };
  const current = {
    digest: pin.sha256,
    files: Object.fromEntries(pin.files.map((file) => [file.path, file.sha256])),
  };
  const pinned = { pin: current };
  const check = await limits.within({
    phase: "trust",
    timeoutMs,
    start: () => trust.service.check(key, current),
    timedOut: () =>
      new InstructionsNotTrustedError(
        `Halonic didn't start agent ${quoted(agent.agentId)}: the check of its instructions didn't answer within ${seconds(timeoutMs)}, so they can't be trusted.`,
        agent.agentId,
        pinned,
      ),
  });
  if (check.kind === "trusted") return;
  throw new InstructionsNotTrustedError(refusalText(agent.agentId, check), agent.agentId, {
    ...pinned,
    changed: check.hadTrusted,
  });
}

function refusalText(
  agentId: string,
  check: Exclude<InstructionTrustCheck, { kind: "trusted" }>,
): string {
  const { added, removed, changed } = check.changes;
  const reason = check.hadTrusted
    ? "its instructions changed since a person trusted them."
    : "a person hasn't trusted its instructions yet.";
  const parts = [`Halonic didn't start agent ${quoted(agentId)}: ${reason}`];
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

/** File names are text from the workspace: quoted and escaped (line and paragraph separators too), so one can't end the sentence or pose as another part of it. */
function quoted(text: string): string {
  const escaped = escapeHidden(JSON.stringify(text));
  return escaped.replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function listOf(names: readonly string[]): string {
  const shown = names.slice(0, namesShown).map(quoted).join(", ");
  const more = names.length - namesShown;
  return more > 0 ? `${shown} and ${more} more` : shown;
}
