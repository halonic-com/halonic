import type { Seat, SeatReading } from "./checklist.ts";

/**
 * Turns what Paperclip answers into the seats the plan works on (HAL-19354):
 * the AI connections (grant, method, status) and the seat readings plugin's
 * readings (`seats` data key: each seat's name, connection and newest
 * `/usage` reading). No I/O here.
 */

/** One AI connection, as `GET /api/companies/:id/ai-connections` lists it. */
export interface Connection {
  readonly id: string;
  readonly grantId: string | undefined;
  readonly method: string;
  readonly status: string;
}

/** One readings seat with its newest reading. */
export interface ReadingsSeat {
  readonly name: string;
  readonly connectionId: string | undefined;
  readonly at: string | undefined;
  readonly error: string | undefined;
  readonly sessionPercent: number | undefined;
  readonly weekPercent: number | undefined;
  /** The plugin's own text, such as `Nov 27, 8pm (UTC)`. */
  readonly weekResets: string | undefined;
}

type Json = Record<string, unknown>;

const record = (value: unknown): Json | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** The connections in the API's answer; anything that isn't one is left out. */
export function parseConnections(body: unknown): Connection[] {
  const list = record(body)?.["connections"];
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const row = record(item);
    const id = text(row?.["id"]);
    if (row === undefined || id === undefined) {
      return [];
    }
    return [
      {
        id,
        grantId: text(row["grantId"]),
        method: text(row["method"]) ?? "unknown",
        status: text(row["status"]) ?? "unknown",
      },
    ];
  });
}

/** The seats in the seat readings plugin's `seats` data, answered as `{ data: { seats } }`. */
export function parseSeatReadings(body: unknown): ReadingsSeat[] {
  const list = record(record(body)?.["data"])?.["seats"];
  return (Array.isArray(list) ? list : []).flatMap((item) => {
    const row = record(item);
    const name = text(row?.["name"]);
    if (row === undefined || name === undefined) {
      return [];
    }
    const reading = record(row["reading"]);
    const usage = record(reading?.["usage"]);
    const session = record(usage?.["session"]);
    const week = record(usage?.["week"]);
    return [
      {
        name,
        connectionId: text(row["connectionId"]),
        at: text(reading?.["at"]),
        error: text(reading?.["error"]),
        sessionPercent: number(session?.["percent"]),
        weekPercent: number(week?.["percent"]),
        weekResets: text(week?.["resets"]),
      },
    ];
  });
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * The time in a reset text such as `Nov 27, 8pm (UTC)` or `8:39pm (UTC)`,
 * read in the reading's year (and on the reading's day when the text names
 * none), or `undefined` for any other form or time zone.
 */
export function parseResetText(resets: string, readAt: string): string | undefined {
  const match =
    /^(?:([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(UTC\)$/i.exec(
      resets.trim(),
    );
  const base = new Date(readAt);
  if (match === null || Number.isNaN(base.getTime())) {
    return undefined;
  }
  const [, monthName, dayText, hourText, minuteText, half] = match;
  const month =
    monthName === undefined ? base.getUTCMonth() : months.indexOf(monthName.toLowerCase());
  if (month < 0) {
    return undefined;
  }
  const day = dayText === undefined ? base.getUTCDate() : Number(dayText);
  const hour = (Number(hourText) % 12) + (half?.toLowerCase() === "pm" ? 12 : 0);
  const at = Date.UTC(base.getUTCFullYear(), month, day, hour, Number(minuteText ?? 0));
  // A reset is never before its reading: one named for early January was read in December.
  const yearOn = at < base.getTime() - 86_400_000 && monthName !== undefined;
  const fixed = yearOn
    ? Date.UTC(base.getUTCFullYear() + 1, month, day, hour, Number(minuteText ?? 0))
    : at;
  return new Date(fixed).toISOString();
}

/** A plugin reading the plan may act on: no error, both windows, and not older than `maxAgeMinutes`. */
function usableReading(
  seat: ReadingsSeat,
  now: Date,
  maxAgeMinutes: number,
): SeatReading | undefined {
  const { at, sessionPercent, weekPercent } = seat;
  if (seat.error !== undefined || at === undefined) {
    return undefined;
  }
  if (sessionPercent === undefined || weekPercent === undefined) {
    return undefined;
  }
  const age = now.getTime() - Date.parse(at);
  if (!(age <= maxAgeMinutes * 60_000)) {
    return undefined;
  }
  const weekResetsAt =
    seat.weekResets === undefined ? undefined : parseResetText(seat.weekResets, at);
  return { sessionPercent, weekPercent, weekResetsAt, at };
}

/**
 * The seats: every connected connection, named and read by the readings seat on
 * it. A connection no readings seat names keeps its id as its name and no
 * reading, so nobody is moved onto it. `quotaSince` gives, per connection,
 * the newest `provider_quota` failure; it marks the seat full when it came
 * after the reading.
 */
export function buildSeats(
  connections: readonly Connection[],
  readings: readonly ReadingsSeat[],
  quotaAt: ReadonlyMap<string, string>,
  now: Date,
  maxAgeMinutes: number,
): Seat[] {
  return connections
    .filter((connection) => connection.status === "connected")
    .map((connection) => {
      const named = readings.find((seat) => seat.connectionId === connection.id);
      const reading = named === undefined ? undefined : usableReading(named, now, maxAgeMinutes);
      const quota = quotaAt.get(connection.id);
      return {
        connectionId: connection.id,
        grantId: connection.grantId,
        name: named?.name ?? connection.id,
        method: connection.method,
        reading,
        quotaHit:
          quota !== undefined &&
          (reading === undefined || Date.parse(quota) > Date.parse(reading.at)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
