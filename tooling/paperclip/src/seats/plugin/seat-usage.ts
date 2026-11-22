import type { SeatAlertKind } from "../read/seat-watch.ts";
import type { ReadError, SeatId, SeatRole, WindowState } from "../records.ts";
import type { SeatReadStatus } from "./seats-reader.ts";
import type { SeatSetting } from "./settings.ts";
import type { StoredSeatReadings } from "./stored-readings.ts";

/** How a seat's newest read went: `ok`, its error, or `no-reading` before the first one. */
export type SeatUsageState = "ok" | ReadError | "no-reading";

/**
 * What `seat_usage` tells an agent about one seat: its label, how its newest
 * read went, and the newest stored windows with their age. Never a folder,
 * an account, a connection id or program output.
 */
export interface SeatUsage {
  readonly seatId: SeatId;
  readonly role: SeatRole;
  readonly resetGroup: string | undefined;
  readonly state: SeatUsageState;
  readonly lastReadAt: string | undefined;
  /** When the windows below were read; undefined before the first good reading. */
  readonly readingAt: string | undefined;
  readonly readingAgeMinutes: number | undefined;
  readonly session: WindowState | undefined;
  readonly week: WindowState | undefined;
  readonly weekByModel: Readonly<Record<string, WindowState>>;
  /** The alerts `seats.read` has in memory now, such as `other-account`. */
  readonly alerts: readonly SeatAlertKind[];
}

/**
 * Puts each seat in the settings together with its stored readings and the
 * alerts `seats.read` holds, in the settings' order. Pure: it reads nothing.
 */
export function seatUsage(
  seats: readonly SeatSetting[],
  stored: readonly StoredSeatReadings[],
  statuses: readonly SeatReadStatus[],
  now: Date,
): SeatUsage[] {
  return seats.map((seat) => {
    const readings = stored.find((entry) => entry.seatId === seat.id);
    const good = readings?.lastGood;
    return {
      seatId: seat.id,
      role: seat.role,
      resetGroup: seat.resetGroup,
      state: readings === undefined ? "no-reading" : (readings.latest.error ?? "ok"),
      lastReadAt: readings?.latest.at,
      readingAt: good?.at,
      readingAgeMinutes:
        good === undefined
          ? undefined
          : Math.max(0, Math.floor((now.getTime() - Date.parse(good.at)) / 60_000)),
      session: good?.session,
      week: good?.week,
      weekByModel: good?.weekByModel ?? {},
      alerts: statuses.find((status) => status.seatId === seat.id)?.alerts ?? [],
    };
  });
}

/** The answer as text: one line per seat. */
export function seatUsageText(usage: readonly SeatUsage[]): string {
  if (usage.length === 0) {
    return "No seats are set in this company's AI seats settings.";
  }
  const lines = usage.map((seat) => {
    const label =
      seat.resetGroup === undefined ? seat.role : `${seat.role}, reset group ${seat.resetGroup}`;
    const alerts = seat.alerts.length > 0 ? ` Alerts: ${seat.alerts.join(", ")}.` : "";
    if (seat.readingAt === undefined) {
      return `- ${seat.seatId} (${label}): ${seat.state}. No stored reading with windows yet.${alerts}`;
    }
    const windows = [
      windowText("session", seat.session),
      windowText("week", seat.week),
      ...Object.entries(seat.weekByModel).map(([model, window]) => windowText(model, window)),
    ].filter((text) => text !== undefined);
    return `- ${seat.seatId} (${label}): ${seat.state}. ${windows.join("; ")}. Read ${seat.readingAgeMinutes} min ago.${alerts}`;
  });
  return [
    "Stored seat readings (this tool never reads a seat itself; times in UTC):",
    ...lines,
  ].join("\n");
}

function windowText(name: string, window: WindowState | undefined): string | undefined {
  if (window === undefined) {
    return undefined;
  }
  const resets = window.resetsAt === undefined ? "" : `, resets ${window.resetsAt}`;
  return `${name} ${window.usedPercent}% used${resets}`;
}
