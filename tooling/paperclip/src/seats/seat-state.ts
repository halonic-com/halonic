/**
 * What the placement rules know about each seat, put together from what the
 * plugin stored: the recent readings, for the windows and their rates, and
 * the manual resets the board recorded. Pure: `seats.check` reads the rows
 * and hands them in.
 */

import type { SeatNow, WindowNow } from "./placement-rules.ts";
import { project, type WindowSample } from "./projection.ts";
import type { SeatEvent, SeatId, SeatReading, SeatRole, WindowState } from "./records.ts";

/** A seat as the board set it; only what the rules need. */
export interface SeatSettingNow {
  readonly id: SeatId;
  readonly role: SeatRole;
  readonly resetGroup: string | undefined;
}

/**
 * A reading older than this is too old to act on. Seats are read every
 * 10 minutes, so this allows two missed reads before the rules leave a seat alone.
 */
export const staleAfterMinutes = 30;

const minuteMs = 60_000;

/**
 * Each seat in the settings, in their order, as the rules see it at `now`
 * (ISO). `readings` are the recent stored readings of any seat, failed ones
 * included; `events` the stored seat events.
 */
export function seatStates(
  seats: readonly SeatSettingNow[],
  readings: readonly SeatReading[],
  events: readonly SeatEvent[],
  now: string,
): SeatNow[] {
  const usedGroups = manualResetGroups(seats, events);
  return seats.map((seat) => {
    const own = readings.filter((reading) => reading.seatId === seat.id);
    const good = own.filter((reading) => reading.error === undefined);
    return {
      id: seat.id,
      role: seat.role,
      // The settings have no pause yet; a seat the board wants out of use is taken out of them.
      status: "active",
      resetGroup: seat.resetGroup,
      manualResetUsed: seat.resetGroup !== undefined && usedGroups.has(seat.resetGroup),
      readable: isReadable(own, now),
      session: windowNow(good, (reading) => reading.session, now),
      week: windowNow(good, (reading) => reading.week, now),
    };
  });
}

/**
 * A seat is readable when its newest reading worked and is at most
 * `staleAfterMinutes` old. A failed newest read makes it unreadable even
 * when an older one worked: the rules must not act on numbers that stopped.
 */
function isReadable(readings: readonly SeatReading[], now: string): boolean {
  const newest = newestOf(readings);
  if (newest === undefined || newest.error !== undefined) {
    return false;
  }
  return Date.parse(now) - Date.parse(newest.at) <= staleAfterMinutes * minuteMs;
}

/** One window now: the projection over the good readings, with the newest reading's reset. */
function windowNow(
  readings: readonly SeatReading[],
  pick: (reading: SeatReading) => WindowState | undefined,
  now: string,
): WindowNow | undefined {
  const samples: WindowSample[] = [];
  for (const reading of readings) {
    const window = pick(reading);
    if (window !== undefined) {
      samples.push({ at: reading.at, usedPercent: window.usedPercent, resetsAt: window.resetsAt });
    }
  }
  const newest = newestOf(samples);
  if (newest === undefined) {
    return undefined;
  }
  const projection = project(samples, now);
  const resetPassed =
    newest.resetsAt !== undefined && Date.parse(newest.resetsAt) <= Date.parse(now);
  return {
    usedPercent: projection.usedPercent,
    percentPerHour: projection.percentPerHour,
    resetsAt: resetPassed ? undefined : newest.resetsAt,
  };
}

/**
 * The reset groups that have used their one manual reset: a group has used
 * it once the board recorded a manual reset for any seat in it.
 */
function manualResetGroups(
  seats: readonly SeatSettingNow[],
  events: readonly SeatEvent[],
): Set<string> {
  const groupOf = new Map(seats.map((seat) => [seat.id, seat.resetGroup]));
  const used = new Set<string>();
  for (const event of events) {
    const group = groupOf.get(event.seatId);
    if (event.kind === "manual-reset" && group !== undefined) {
      used.add(group);
    }
  }
  return used;
}

function newestOf<T extends { readonly at: string }>(items: readonly T[]): T | undefined {
  let newest: T | undefined;
  for (const item of items) {
    if (newest === undefined || Date.parse(item.at) > Date.parse(newest.at)) {
      newest = item;
    }
  }
  return newest;
}
