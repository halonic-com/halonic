/**
 * The proposal `seats.check` posts on the board's task, in plain words. It
 * shows how many agents each seat would hold after the moves, so the board
 * sees when many agents would land on one seat before it applies them.
 */

import type {
  MoveReason,
  PlacementProposal,
  PlacementRules,
  ProposedMove,
  SeatNow,
} from "./placement-rules.ts";
import type { AgentId, SeatId } from "./records.ts";

/** What the text is written from. */
export interface ProposalTextInput {
  readonly proposal: PlacementProposal;
  readonly seats: readonly SeatNow[];
  /** Agent → seat, from the open placements, before the moves. */
  readonly placements: ReadonlyMap<AgentId, SeatId>;
  /** Agent names to show instead of ids, where known. */
  readonly agentNames: ReadonlyMap<AgentId, string>;
  readonly rules: PlacementRules;
  /** When the proposal was made, as an ISO time. */
  readonly at: string;
}

/** The proposal as a task comment, or `undefined` when there is nothing to propose. */
export function proposalText(input: ProposalTextInput): string | undefined {
  const { proposal } = input;
  if (proposal.moves.length === 0 && proposal.resetAdvice.length === 0) {
    return undefined;
  }
  const lines = [
    `**Proposed seat moves** (seats.check, ${input.at} UTC). Nothing has moved: the board applies these.`,
  ];
  if (proposal.moves.length > 0) {
    lines.push("", ...proposal.moves.map((move) => moveLine(move, input)));
    lines.push("", ...loadLines(input));
  }
  if (proposal.resetAdvice.length > 0) {
    lines.push("", ...proposal.resetAdvice.map((seatId) => resetLine(seatId, input)));
  }
  return lines.join("\n");
}

function moveLine(move: ProposedMove, input: ProposalTextInput): string {
  const agent = input.agentNames.get(move.agentId) ?? move.agentId;
  const why = reasonText(move.reason, seatOf(move.from, input), input.rules);
  if (move.to === undefined) {
    return `- ${agent}: off ${move.from} (${why}), but no seat can take it now.`;
  }
  return `- ${agent}: ${move.from} → ${move.to} (${why}).`;
}

/** Why an agent moves off a seat, in numbers; the page uses it too. */
export function reasonText(
  reason: MoveReason,
  seat: Pick<SeatNow, "session" | "week"> | undefined,
  rules: PlacementRules,
): string {
  const session = seat?.session?.usedPercent;
  const week = seat?.week?.usedPercent;
  switch (reason) {
    case "paid-api":
      return "a paid-API seat takes no agents";
    case "session-hard-stop":
      return `5-hour window at ${session}%, at or heading to ${rules.sessionHardStopPercent}% before the next check`;
    case "session-full":
      return `5-hour window at ${session}%`;
    case "session-projected":
      return rules.projectionMinutes === undefined
        ? `5-hour window at ${session}%, heading above ${rules.sessionProjectedPercent}% before its reset`
        : `5-hour window at ${session}%, heading above ${rules.sessionProjectedPercent}% within ${rules.projectionMinutes} minutes`;
    case "week-full":
      return `week at ${week}%`;
    case "week-reserve":
      return `week at ${week}% with its reset more than ${rules.reserveResetHours} hours away, kept as a reserve`;
  }
}

/** For each seat that takes agents: how many it holds now and after the moves. */
function loadLines(input: ProposalTextInput): string[] {
  const before = countBySeat(input.placements.values());
  const after = new Map(before);
  for (const move of input.proposal.moves) {
    if (move.to !== undefined) {
      after.set(move.from, (after.get(move.from) ?? 0) - 1);
      after.set(move.to, (after.get(move.to) ?? 0) + 1);
    }
  }
  const targets = [...new Set(input.proposal.moves.flatMap((move) => move.to ?? []))].sort();
  const limit =
    input.rules.agentsPerSeat === undefined
      ? "No limit of agents per seat is set."
      : `At most ${input.rules.agentsPerSeat} agents per seat.`;
  return [
    `Seats after these moves. ${limit}`,
    ...targets.map(
      (seatId) =>
        `- ${seatId}: ${agentsText(after.get(seatId) ?? 0)} (${before.get(seatId) ?? 0} now).`,
    ),
  ];
}

function resetLine(seatId: SeatId, input: ProposalTextInput): string {
  const seat = seatOf(seatId, input);
  const resetsAt = seat?.week?.resetsAt ?? "an unknown time";
  return `- **Manual reset worth it:** ${seatId} is at ${seat?.week?.usedPercent}% of its week, which resets at ${resetsAt}, and reset group ${seat?.resetGroup} hasn't used its manual reset.`;
}

function seatOf(seatId: SeatId, input: ProposalTextInput): SeatNow | undefined {
  return input.seats.find((seat) => seat.id === seatId);
}

function countBySeat(seatIds: Iterable<SeatId>): Map<SeatId, number> {
  const counts = new Map<SeatId, number>();
  for (const seatId of seatIds) {
    counts.set(seatId, (counts.get(seatId) ?? 0) + 1);
  }
  return counts;
}

function agentsText(count: number): string {
  return count === 1 ? "1 agent" : `${count} agents`;
}
