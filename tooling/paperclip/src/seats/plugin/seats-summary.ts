import { defaultPlacementRules, proposePlacements } from "../placement-rules.ts";
import { proposalText } from "../proposal-text.ts";
import type { ReadError, SeatId, SeatRole } from "../records.ts";
import type { SeatsRouteDeps } from "./routes.ts";
import type { AgentLabel, SeatRow, WindowRow } from "./seats-page.ts";
import { seatsPage } from "./seats-page.ts";
import type { SeatReadStatus } from "./seats-reader.ts";
import type { SeatsSettings } from "./settings.ts";

/**
 * What `GET /seats/summary` answers (HAL-17625): the seats for Halonic's
 * `TeamStatus` provider, trimmed to what its `Seat` type carries. It is
 * built field by field, never by spreading a setting or a page row, so a
 * folder, an account, a connection id, a sign-in expiry or program output
 * can't slip in when one of those types grows.
 */
export interface SeatsSummary {
  /** When the summary was made. */
  readonly at: string;
  readonly seats: readonly SummarySeat[];
  /** What `seats.check` would propose now, in plain words; absent when it proposes nothing. */
  readonly proposal: SummaryProposal | undefined;
}

/** One seat, by its board label only. */
export interface SummarySeat {
  readonly id: SeatId;
  /** The label the board gave the seat: its id in the settings. */
  readonly label: string;
  readonly role: SeatRole;
  /** When its newest good reading was taken; absent before the first one. */
  readonly asOf: string | undefined;
  /** `false` when the newest read failed or is too old to act on. */
  readonly readable: boolean;
  readonly lastError: ReadError | undefined;
  readonly windows: readonly SummaryWindow[];
  readonly agents: readonly AgentLabel[];
  /** Whether the seat's reset group has used its one manual reset. */
  readonly manualResetUsed: boolean;
}

/** One usage window of a seat. */
export interface SummaryWindow {
  readonly kind: "five-hour" | "week";
  readonly label: string;
  readonly usedPercent: number;
  readonly resetsAt: string | undefined;
  /** When it crosses 90% at today's rate, if before its reset; the time itself when already past. */
  readonly reaches90At: string | undefined;
}

/** The proposal as text, with when it was made. The app shows it and never carries it out. */
export interface SummaryProposal {
  readonly text: string;
  readonly at: string;
}

/** The summary's data: the page's seat rows and the proposal `seats.check` would post now. */
export async function seatsSummaryData(
  companyId: string,
  settings: SeatsSettings,
  deps: SeatsRouteDeps,
): Promise<SeatsSummary> {
  const now = deps.now();
  const at = now.toISOString();
  const seatsNowState = await deps.seatsNow(companyId, settings, now);
  const reads = deps.reads(settings.seats);
  const proposal = proposePlacements(
    seatsNowState.seats,
    seatsNowState.placements,
    at,
    defaultPlacementRules,
  );
  const page = seatsPage({
    now: seatsNowState,
    proposal,
    statuses: reads.seats,
    readerStartedAt: reads.readerStartedAt,
    movesEnabled: settings.movesEnabled,
    at,
  });
  const text = proposalText({
    proposal,
    seats: seatsNowState.seats,
    placements: seatsNowState.placements,
    agentNames: seatsNowState.agentNames,
    rules: defaultPlacementRules,
    at,
  });
  return {
    at,
    seats: page.seats.map((row) => summarySeat(row, reads.seats, at)),
    proposal: text === undefined ? undefined : { text: plainText(text), at },
  };
}

function summarySeat(row: SeatRow, statuses: readonly SeatReadStatus[], at: string): SummarySeat {
  const ageMs = statuses.find((status) => status.seatId === row.seatId)?.readingAgeMs;
  const windows: SummaryWindow[] = [];
  if (row.session !== undefined) {
    windows.push(summaryWindow("five-hour", "5-hour window", row.session));
  }
  if (row.week !== undefined) {
    windows.push(summaryWindow("week", "Week", row.week));
  }
  return {
    id: row.seatId,
    label: row.seatId,
    role: row.role,
    asOf: ageMs === undefined ? undefined : new Date(Date.parse(at) - ageMs).toISOString(),
    readable: row.readable,
    lastError: row.lastError,
    windows,
    agents: row.agents.map((agent) => ({ agentId: agent.agentId, name: agent.name })),
    manualResetUsed: row.manualResetUsed,
  };
}

function summaryWindow(kind: SummaryWindow["kind"], label: string, row: WindowRow): SummaryWindow {
  return {
    kind,
    label,
    usedPercent: row.usedPercent,
    resetsAt: row.resetsAt,
    reaches90At: row.reaches90At,
  };
}

/** The task comment's bold heading marks, gone: apps render the proposal as plain text. */
function plainText(markdown: string): string {
  return markdown.replaceAll("**", "");
}
