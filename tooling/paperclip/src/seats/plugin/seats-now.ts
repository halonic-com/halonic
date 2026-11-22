import { agentSeat } from "../agent-seat.ts";
import type { SeatNow } from "../placement-rules.ts";
import type { AgentId, SeatId } from "../records.ts";
import { seatStates } from "../seat-state.ts";
import type { PaperclipTables } from "./paperclip-tables.ts";
import type { SeatsSettings } from "./settings.ts";
import type { SeatsStore } from "./store.ts";
import type { RecentReadings } from "./stored-readings.ts";

/**
 * How far back the readings go. It covers a whole 5-hour window, so the
 * rates the rules project come from the window the seat is in.
 */
export const readingsLookbackMs = 6 * 60 * 60_000;

/** Where the seats and their agents stand: what `seats.check` and the page both start from. */
export interface SeatsNow {
  /** Each seat in the settings, in their order, as the placement rules see it. */
  readonly seats: readonly SeatNow[];
  /** Agent → the seat it is on now. Agents on no seat in the settings are left out. */
  readonly placements: ReadonlyMap<AgentId, SeatId>;
  /** Agent → its name in Paperclip, so proposals and the page don't show bare ids. */
  readonly agentNames: ReadonlyMap<AgentId, string>;
}

/** What `seatsNow` reads. */
export interface SeatsNowDeps {
  readonly tables: Pick<PaperclipTables, "agentsNow">;
  readonly readings: RecentReadings;
  readonly store: Pick<SeatsStore, "manualResets">;
}

/**
 * Reads the recent stored readings, the manual resets and where each agent
 * of `companyId` is now, and puts them together. It reads only the plugin's
 * own tables and Paperclip's `agents` table, never a seat.
 */
export async function seatsNow(
  companyId: string,
  settings: SeatsSettings,
  deps: SeatsNowDeps,
  now: Date,
): Promise<SeatsNow> {
  const since = new Date(now.getTime() - readingsLookbackMs).toISOString();
  const seats = seatStates(
    settings.seats,
    await deps.readings.since(since),
    await deps.store.manualResets(),
    now.toISOString(),
  );

  const placements = new Map<AgentId, SeatId>();
  const agentNames = new Map<AgentId, string>();
  for (const agent of await deps.tables.agentsNow(companyId)) {
    const seatId = agentSeat(agent, settings.seats);
    if (seatId !== undefined) {
      placements.set(agent.agentId, seatId);
    }
    if (agent.name !== undefined) {
      agentNames.set(agent.agentId, agent.name);
    }
  }
  return { seats, placements, agentNames };
}
