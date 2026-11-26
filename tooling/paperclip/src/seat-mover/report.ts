import type { Seat } from "./checklist.ts";
import type { Move, MoveReason, SeatPlan, Stuck } from "./plan.ts";

/**
 * The seat mover's words (HAL-19354): one line per move with its reason, the
 * batch's comment on the log task, and the one note to the board when an
 * agent must move and no seat may take it. Names and numbers only.
 */

const reasonWords: Record<MoveReason, string> = {
  "d-admin": "it sat on an excluded seat",
  "e-paid-api": "it sat on the paid API",
  "not-connected": "its seat's connection isn't connected",
  "quota-hit": "a run on its seat just failed on the seat's quota",
  parked: "it has runs parked waiting for its seat",
  "session-stop": "its seat passed its 5-hour stop",
  "week-stop": "its seat passed the weekly stop",
  "b-reviewer-seat": "it shared a reviewer's seat",
  "b-reviewers-share": "two reviewers shared a seat",
  "b-reviewer-not-alone": "the reviewer wasn't alone and the others couldn't move",
  "c-heavy-limit": "its seat had too many heavy agents",
  "g-quiet-seat": "it sat on the timer agents' quiet seat",
};

function usage(seat: Seat | undefined): string {
  const reading = seat?.reading;
  if (reading === undefined) {
    return "no reading";
  }
  return `5h ${reading.sessionPercent}%, week ${reading.weekPercent}%`;
}

export function seatName(seats: ReadonlyMap<string, Seat>, connectionId: string | undefined) {
  if (connectionId === undefined) {
    return "no seat";
  }
  return `${seats.get(connectionId)?.name ?? connectionId} seat`;
}

export function moveLine(move: Move, seats: ReadonlyMap<string, Seat>): string {
  const from = seatName(seats, move.from);
  const to = `${move.to.name} seat (${usage(move.to)})`;
  return `${move.agent.name}: ${from} (${usage(seats.get(move.from ?? ""))}) → ${to}, because ${reasonWords[move.reason]}.`;
}

export function stuckLine(stuck: Stuck, seats: ReadonlyMap<string, Seat>): string {
  const from = seatName(seats, stuck.from);
  return `${stuck.agent.name} stays on the ${from} (${usage(seats.get(stuck.from ?? ""))}): ${reasonWords[stuck.reason]}, and no seat passes the checklist.`;
}

/** The batch's comment on the log task; `shadow` says nobody was moved. */
export function batchComment(
  plan: SeatPlan,
  seats: ReadonlyMap<string, Seat>,
  mode: "shadow" | "act",
  released: number,
): string {
  const head = mode === "act" ? "**Seat mover (act)**" : "**Seat mover (shadow, nobody moved)**";
  const lines = plan.moves.map((move) => `- ${moveLine(move, seats)}`);
  if (released > 0) {
    lines.push(
      `- Released ${released} parked runs that never started, from seats their agents left.`,
    );
  }
  if (plan.stuck.length > 0) {
    lines.push(...plan.stuck.map((stuck) => `- ${stuckLine(stuck, seats)}`));
  }
  return [head, ...lines].join("\n");
}

/** The one note to the board for an agent that must move and has no legal seat. */
export function stuckNote(stuck: Stuck, seats: ReadonlyMap<string, Seat>): string {
  return `**Seat mover: no legal seat.** ${stuckLine(stuck, seats)} It stays where it is until a seat frees up; this note comes once.`;
}
