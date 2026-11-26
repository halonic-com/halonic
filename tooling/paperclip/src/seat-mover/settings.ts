/**
 * The seat mover's settings (HAL-19354), as the board saves them under
 * `seatMover` in the Agent tools plugin's settings. Only the board can change
 * a plugin's settings, so the switch to `act` is board-only.
 */

/** `off`: reads nothing. `shadow`: plans and logs, moves nobody. `act`: moves agents. */
export type SeatMoverMode = "off" | "shadow" | "act";

export interface SeatMoverSettings {
  readonly mode: SeatMoverMode;
  /** Url keys of the reviewers: each sits alone, on the seat with the most 5-hour room. */
  readonly reviewers: readonly string[];
  /** Url keys of the heavy agents: at most `maxHeavyPerSeat` of them share a seat. */
  readonly heavy: readonly string[];
  /**
   * Url keys of agents the mover never moves: the seat starter and the timer
   * agents. A seat any of them sits on is the quiet seat, which no heavy agent joins.
   */
  readonly pinned: readonly string[];
  /** Seat names the board is draining to its weekly limit: the weekly stop doesn't apply to them. */
  readonly resetFill: readonly string[];
  /** Seat names or connection ids no agent is ever placed on (the Admin seat). */
  readonly excludedSeats: readonly string[];
  /** The key or id of the plugin whose `seats` data holds the readings; set by the board. */
  readonly readingsPlugin: string | undefined;
  /** Move off, and never onto, a seat at this much of its 5-hour window. */
  readonly sessionMovePercent: number;
  /** The same for a reviewer, who moves earlier (HAL-19202). */
  readonly reviewerSessionMovePercent: number;
  /** Move off, and never onto, a seat at this much of its week … */
  readonly weekMovePercent: number;
  /** … unless its weekly reset is less than this many hours away … */
  readonly resetSoonHours: number;
  /** … and below this much of its week even then. */
  readonly weekHardStopPercent: number;
  readonly maxHeavyPerSeat: number;
  /** A reading older than this many minutes counts as unknown: nobody moves onto that seat. */
  readonly readingMaxAgeMinutes: number;
  /** The task each batch of moves is logged on, one comment per batch (HAL-16116). */
  readonly logTask: string | undefined;
  /** The task told once when an agent must move and no seat may take it. */
  readonly boardTask: string | undefined;
}

export const defaultSeatMoverSettings: SeatMoverSettings = {
  mode: "shadow",
  reviewers: ["liam", "julian"],
  heavy: ["mateo", "elena", "tomas", "owen", "priya", "ravi"],
  pinned: ["pip"],
  resetFill: ["Ravi"],
  excludedSeats: ["Admin"],
  readingsPlugin: undefined,
  sessionMovePercent: 80,
  reviewerSessionMovePercent: 70,
  weekMovePercent: 88,
  resetSoonHours: 24,
  weekHardStopPercent: 98,
  maxHeavyPerSeat: 2,
  readingMaxAgeMinutes: 45,
  logTask: undefined,
  boardTask: undefined,
};

const modes: readonly SeatMoverMode[] = ["off", "shadow", "act"];

function words(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function percent(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 0 && value <= 100 ? value : fallback;
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Reads `seatMover`; anything odd falls back to its default, and an unknown mode to `shadow`. */
export function readSeatMoverSettings(
  config: Readonly<Record<string, unknown>>,
): SeatMoverSettings {
  const section = (config["seatMover"] ?? {}) as Record<string, unknown>;
  const d = defaultSeatMoverSettings;
  const mode = modes.find((candidate) => candidate === section["mode"]) ?? d.mode;
  return {
    mode,
    reviewers: words(section["reviewers"], d.reviewers),
    heavy: words(section["heavy"], d.heavy),
    pinned: words(section["pinned"], d.pinned),
    resetFill: words(section["resetFill"], d.resetFill),
    excludedSeats: words(section["excludedSeats"], d.excludedSeats),
    readingsPlugin: text(section["readingsPlugin"]),
    sessionMovePercent: percent(section["sessionMovePercent"], d.sessionMovePercent),
    reviewerSessionMovePercent: percent(
      section["reviewerSessionMovePercent"],
      d.reviewerSessionMovePercent,
    ),
    weekMovePercent: percent(section["weekMovePercent"], d.weekMovePercent),
    resetSoonHours: positive(section["resetSoonHours"], d.resetSoonHours),
    weekHardStopPercent: percent(section["weekHardStopPercent"], d.weekHardStopPercent),
    maxHeavyPerSeat: positive(section["maxHeavyPerSeat"], d.maxHeavyPerSeat),
    readingMaxAgeMinutes: positive(section["readingMaxAgeMinutes"], d.readingMaxAgeMinutes),
    logTask: text(section["logTask"]),
    boardTask: text(section["boardTask"]),
  };
}
