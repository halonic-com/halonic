import type { AgentPlace, Seat } from "./checklist.ts";
import { defaultSeatMoverSettings, type SeatMoverSettings } from "./settings.ts";

/** Shared builders for the seat mover's tests. */

export const now = new Date("2026-11-26T10:00:00.000Z");

/** Four days out: no weekly reset soon. */
export const farReset = "2026-11-30T10:00:00.000Z";

export const settings: SeatMoverSettings = {
  ...defaultSeatMoverSettings,
  mode: "act",
  logTask: "HAL-1",
};

export function seat(
  name: string,
  session: number,
  week: number,
  overrides: Partial<Seat> & { weekResetsAt?: string } = {},
): Seat {
  const { weekResetsAt = farReset, ...rest } = overrides;
  return {
    connectionId: `c-${name}`,
    grantId: `g-${name}`,
    name,
    method: "subscription",
    reading: {
      sessionPercent: session,
      sessionResetsAt: undefined,
      weekPercent: week,
      weekResetsAt,
      at: now.toISOString(),
    },
    quotaHit: false,
    waiting: false,
    connection: "connected",
    ...rest,
  };
}

export function agent(
  key: string,
  seatName: string | undefined,
  overrides: Partial<AgentPlace> = {},
) {
  const place: AgentPlace = {
    id: `a-${key}`,
    key,
    name: key[0]?.toUpperCase() + key.slice(1),
    paused: false,
    connectionId: seatName === undefined ? undefined : `c-${seatName}`,
    parked: false,
    recentlyMoved: false,
    ...overrides,
  };
  return place;
}
