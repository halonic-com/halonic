import { parseAuthStatus, type SignInStatus } from "../auth-status.ts";
import type { ReadError, SeatId, SeatReading, WindowState } from "../records.ts";
import { parseUsage, type UsageWindow } from "../usage.ts";
import type { CommandResult, CommandRunner } from "./command.ts";

/** What a read needs to know about a seat. The board's seat settings carry it. */
export interface SeatToRead {
  readonly id: SeatId;
  /** The seat's Claude Code folder; it goes to the program and nowhere else. */
  readonly configDir: string;
  /** The e-mail the seat should be signed in with; only compared. */
  readonly account: string | undefined;
}

export interface ReadSeatDeps {
  readonly run: CommandRunner;
  readonly now: () => string;
  /**
   * The only variables the program gets besides the seat's folder, such as
   * `PATH` and `HOME`. An API key in the worker's own environment never
   * reaches it, so a read can't fall back to the paid API.
   */
  readonly env: Readonly<Record<string, string>>;
}

/** One read of one seat: the reading to store and the sign-in, when it could be read. */
export interface SeatReadOutcome {
  readonly reading: SeatReading;
  readonly signIn: SignInStatus | undefined;
}

export const signInTimeoutMs = 20_000;
export const usageTimeoutMs = 60_000;
/** A read that timed out or printed nothing readable is tried once more; a rate limit is not. */
export const usageAttempts = 2;

const rateLimitText = /rate[ _-]?limit|\b429\b/i;

/**
 * Reads one seat: first its sign-in (`claude auth status --json`), then, only
 * for a subscription sign-in, its limits (`claude -p /usage`). The output is
 * parsed here and dropped; nothing of it is logged.
 */
export async function readSeat(seat: SeatToRead, deps: ReadSeatDeps): Promise<SeatReadOutcome> {
  const env = { ...deps.env, CLAUDE_CONFIG_DIR: seat.configDir };
  const auth = await deps.run({
    program: "claude",
    args: ["auth", "status", "--json"],
    env,
    timeoutMs: signInTimeoutMs,
  });
  if (auth.kind === "timed-out") {
    return { reading: failed(seat.id, deps.now(), "timeout"), signIn: undefined };
  }
  const signIn = parseAuthStatus(auth.stdout, seat.account);
  if (signIn.state !== "signed-in") {
    const error: ReadError = signIn.state === "unreadable" ? "unreadable" : "signed-out";
    return { reading: failed(seat.id, deps.now(), error), signIn };
  }
  // Another account's usage isn't this seat's: it must never reach the history or the forecast.
  if (signIn.account === "differs") {
    return { reading: failed(seat.id, deps.now(), "signed-out"), signIn };
  }

  let reading = failed(seat.id, deps.now(), "unreadable");
  for (let attempt = 1; attempt <= usageAttempts; attempt += 1) {
    const usage = await deps.run({
      program: "claude",
      args: ["-p", "/usage"],
      env,
      timeoutMs: usageTimeoutMs,
    });
    reading = usageReading(seat.id, deps.now(), usage);
    if (reading.error !== "timeout" && reading.error !== "unreadable") {
      break;
    }
  }
  return { reading, signIn };
}

function usageReading(seatId: SeatId, at: string, result: CommandResult): SeatReading {
  if (result.kind === "timed-out") {
    return failed(seatId, at, "timeout");
  }
  const parsed = parseUsage(result.stdout, at);
  if (result.code === 0 && parsed.kind === "read") {
    return withWindows(seatId, at, parsed.windows);
  }
  const rateLimited = rateLimitText.test(`${result.stdout}\n${result.stderr}`);
  return failed(seatId, at, rateLimited ? "rate-limited" : "unreadable");
}

function withWindows(seatId: SeatId, at: string, windows: readonly UsageWindow[]): SeatReading {
  const state = (window: UsageWindow): WindowState => ({
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt,
  });
  const session = windows.find((window) => window.kind === "session");
  const week = windows.find((window) => window.kind === "week");
  const weekByModel: Record<string, WindowState> = {};
  for (const window of windows) {
    if (window.kind === "week-model" && window.model !== undefined) {
      weekByModel[window.model] = state(window);
    }
  }
  return {
    seatId,
    at,
    error: undefined,
    session: session === undefined ? undefined : state(session),
    week: week === undefined ? undefined : state(week),
    weekByModel,
  };
}

function failed(seatId: SeatId, at: string, error: ReadError): SeatReading {
  return { seatId, at, error, session: undefined, week: undefined, weekByModel: {} };
}
