import { aiConnectionOf, sendRuntimeConfig } from "./act.ts";
import type { SeatApi } from "./api.ts";
import type { AgentRow } from "./pass.ts";
import type { Connection, ReadingsSeat } from "./readings.ts";

/**
 * "Seat was reset" (HAL-19490): after the board resets a seat by hand,
 * Paperclip still holds that seat's agents until the old reset, because the
 * check before each run reads their old limit failures. The board's server
 * patch (halonic-com/server, HAL-19121 module) stops counting a connection's
 * limit evidence from before `runtimeConfig.halonicLimitReset.at`, and the
 * write itself releases the agent's parked runs. This writes that marker on
 * every agent on the seat, and the seat mover keeps the reset time so it
 * doesn't read the seat as full from a reading or quota failure that came
 * before it.
 */

/** Seat resets the board reported: connection id → ISO time. */
export type SeatResets = Readonly<Record<string, string>>;

/** How long a reset is kept: longer than the oldest reading or quota failure the mover reads. */
export const resetKeepMs = 6 * 60 * 60_000;

/** The resets still worth keeping at `now`. */
export function recentResets(resets: SeatResets, now: Date): SeatResets {
  return Object.fromEntries(
    Object.entries(resets).filter(([, at]) => now.getTime() - Date.parse(at) < resetKeepMs),
  );
}

/** True when something seen at `at` on this seat came before the seat's last reset. */
export function beforeReset(resets: SeatResets, connectionId: string, at: string): boolean {
  const reset = resets[connectionId];
  return reset !== undefined && Date.parse(at) <= Date.parse(reset);
}

/** A seat the board named: a readings seat name (any case) or a connection id. */
export interface NamedSeat {
  readonly connectionId: string;
  readonly name: string;
}

export function findSeat(
  seat: string,
  connections: readonly Connection[],
  readings: readonly ReadingsSeat[],
): NamedSeat | undefined {
  const wanted = seat.trim().toLowerCase();
  const byName = readings.find((reading) => reading.name.toLowerCase() === wanted)?.connectionId;
  const connection = connections.find(
    (candidate) => candidate.id === byName || candidate.id.toLowerCase() === wanted,
  );
  if (connection === undefined) {
    return undefined;
  }
  const name = readings.find((reading) => reading.connectionId === connection.id)?.name;
  return { connectionId: connection.id, name: name ?? connection.id };
}

/** The agents pinned to this seat now (a router or no connection is left alone). */
export function agentsOnSeat(agents: readonly AgentRow[], connectionId: string): AgentRow[] {
  return agents.filter((agent) => {
    const connection = agent.runtimeConfig?.["aiConnection"] as Record<string, unknown> | undefined;
    return (
      agent.status !== "terminated" &&
      connection?.["mode"] === "delegated" &&
      connection["connectionId"] === connectionId
    );
  });
}

export type MarkOutcome = "marked" | "marked-heartbeat-restored" | "skipped-moved";

/**
 * Writes the reset on one agent: its whole `runtimeConfig` back with only
 * `halonicLimitReset` set, the same way a move is sent. An agent someone
 * moved off the seat since the list was read is left alone.
 */
export async function markReset(
  api: SeatApi,
  agentId: string,
  connectionId: string,
  at: string,
): Promise<MarkOutcome> {
  const before = await api.agent(agentId);
  if (aiConnectionOf(before)["connectionId"] !== connectionId) {
    return "skipped-moved";
  }
  const sent = await sendRuntimeConfig(api, before, {
    halonicLimitReset: { connectionId, at },
  });
  return sent === "sent" ? "marked" : "marked-heartbeat-restored";
}
