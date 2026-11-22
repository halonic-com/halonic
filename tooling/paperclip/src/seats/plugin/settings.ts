import type { SeatId, SeatRole } from "../records.ts";

/**
 * One seat as the board set it in the plugin's settings. The folder, the
 * expected account and the connection id are sign-in details: they stay in the worker, and nothing
 * the plugin logs, stores or answers carries them (see `PublicSeat`).
 */
export interface SeatSetting {
  readonly id: SeatId;
  readonly role: SeatRole;
  readonly configDir: string;
  readonly account: string | undefined;
  /** Paperclip's id for the seat's Claude connection, which agents name in their settings. */
  readonly connectionId: string | undefined;
  readonly resetGroup: string | undefined;
}

export interface SeatsSettings {
  /** In the board's order, which sets each seat's read minute. */
  readonly seats: readonly SeatSetting[];
  /** Off unless the board turns it on: then `seats.check` only proposes moves. */
  readonly movesEnabled: boolean;
}

/** What a route may show about a seat. */
export interface PublicSeat {
  readonly id: SeatId;
  readonly role: SeatRole;
  readonly resetGroup: string | undefined;
}

const roles: readonly SeatRole[] = ["pool", "reserve", "paid-api"];
const seatIdPattern = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Reads the settings the host hands over. The host checks them against the
 * manifest's schema when the board saves them, but this reads defensively:
 * a seat without a valid id, role or folder is left out, and so is a second
 * seat with an id already taken, so a bad entry can never stand in for another.
 */
export function readSeatsSettings(config: Readonly<Record<string, unknown>>): SeatsSettings {
  const entries = Array.isArray(config["seats"]) ? config["seats"] : [];
  const seats: SeatSetting[] = [];
  for (const entry of entries) {
    const seat = readSeat(entry);
    if (seat !== undefined && !seats.some((taken) => taken.id === seat.id)) {
      seats.push(seat);
    }
  }
  return { seats, movesEnabled: config["movesEnabled"] === true };
}

export function publicSeat(seat: SeatSetting): PublicSeat {
  return { id: seat.id, role: seat.role, resetGroup: seat.resetGroup };
}

function readSeat(entry: unknown): SeatSetting | undefined {
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const record = entry as Record<string, unknown>;
  const id = record["id"];
  const role = record["role"];
  const configDir = record["configDir"];
  if (typeof id !== "string" || !seatIdPattern.test(id)) {
    return undefined;
  }
  if (!roles.includes(role as SeatRole) || typeof configDir !== "string" || configDir === "") {
    return undefined;
  }
  return {
    id,
    role: role as SeatRole,
    configDir,
    account: optionalText(record["account"]),
    connectionId: optionalText(record["connectionId"]),
    resetGroup: optionalText(record["resetGroup"]),
  };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
