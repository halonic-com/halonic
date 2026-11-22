/**
 * Keeps the placement history in step with the agents' seat settings.
 * Paperclip has no readable history of past settings, so the plugin records
 * each change as it sees it. No I/O here: the job reads the agents' seat
 * field and the open placements, and stores what this returns.
 */

import type { AgentId, Placement, PlacementSource, SeatId } from "./records.ts";

/** What changes in the placement history. */
export interface PlacementChanges {
  /** Open placements that end now, with `to` set. */
  readonly closed: readonly Placement[];
  /** New open placements that start now. */
  readonly opened: readonly Placement[];
}

/**
 * Compares the open placements with where each agent is now (`undefined`
 * for an agent on no seat). A placement ends when its agent moved, left its
 * seat or is gone; a new one starts for each agent on a seat it had no open
 * placement for.
 */
export function placementChanges(
  open: readonly Placement[],
  seatsNow: ReadonlyMap<AgentId, SeatId | undefined>,
  at: string,
  source: PlacementSource,
): PlacementChanges {
  const stillOpen = new Map<AgentId, SeatId>();
  const closed: Placement[] = [];
  for (const placement of open) {
    if (placement.to !== undefined) {
      continue;
    }
    if (seatsNow.get(placement.agentId) === placement.seatId) {
      stillOpen.set(placement.agentId, placement.seatId);
    } else {
      closed.push({ ...placement, to: at });
    }
  }
  const opened: Placement[] = [];
  for (const [agentId, seatId] of seatsNow) {
    if (seatId !== undefined && stillOpen.get(agentId) !== seatId) {
      opened.push({ agentId, seatId, from: at, to: undefined, source });
    }
  }
  return { closed, opened };
}
