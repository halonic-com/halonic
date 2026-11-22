import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { SignInStatus } from "../auth-status.ts";
import type { ReadError, SeatReading } from "../records.ts";
import { ReadRounds } from "./read-round.ts";
import type { SeatReadOutcome, SeatToRead } from "./read-seat.ts";
import {
  afterRead,
  isDue,
  readingAgeMs,
  type SeatWatch,
  seatAlerts,
  startWatch,
} from "./seat-watch.ts";

const minute = 60_000;
const signedIn: SignInStatus = {
  state: "signed-in",
  account: "matches",
  plan: "max",
  expiresAt: undefined,
};

function outcome(at: string, error?: ReadError, signIn: SignInStatus = signedIn): SeatReadOutcome {
  const reading: SeatReading = {
    seatId: "seat-a",
    at,
    error,
    session: undefined,
    week: undefined,
    weekByModel: {},
  };
  return { reading, signIn };
}

function watchAt(minuteOffset: number, now: string): SeatWatch {
  return startWatch("seat-a", minuteOffset * minute, now);
}

verifies("paperclip.seats-read-watch", () => {
  test("after a good read the seat is read again at its offset in the next bucket", () => {
    const watch = afterRead(
      watchAt(3, "2026-11-22T10:00:00Z"),
      outcome("2026-11-22T10:03:00.000Z"),
    );

    expect(watch.nextReadAt).toBe("2026-11-22T10:13:00.000Z");
    expect(isDue(watch, "2026-11-22T10:12:59.000Z")).toBe(false);
    expect(isDue(watch, "2026-11-22T10:13:00.000Z")).toBe(true);
    expect(readingAgeMs(watch, "2026-11-22T10:05:00.000Z")).toBe(2 * minute);
  });

  test("rate limits in a row back off to 20, 40 and at most 60 minutes, and a good read ends it", () => {
    let watch = watchAt(3, "2026-11-22T10:00:00Z");
    const planned: string[] = [];
    for (const at of ["10:03", "10:23", "11:03", "12:03"]) {
      watch = afterRead(watch, outcome(`2026-11-22T${at}:00.000Z`, "rate-limited"));
      planned.push(watch.nextReadAt.slice(11, 16));
    }
    expect(planned).toEqual(["10:23", "11:03", "12:03", "13:03"]);

    watch = afterRead(watch, outcome("2026-11-22T13:03:00.000Z"));
    expect(watch.rateLimitedInARow).toBe(0);
    expect(watch.nextReadAt).toBe("2026-11-22T13:13:00.000Z");
  });

  test("a sign-in that expires within a day, or has expired, raises an alert", () => {
    const expiring = { ...signedIn, expiresAt: "2026-11-22T12:00:00.000Z" };
    const watch = afterRead(
      watchAt(3, "2026-11-22T10:00:00Z"),
      outcome("2026-11-22T10:03:00.000Z", undefined, expiring),
    );

    expect(seatAlerts(watch, "2026-11-22T10:04:00.000Z")).toEqual([
      { seatId: "seat-a", kind: "sign-in-expiring" },
    ]);
    expect(seatAlerts(watch, "2026-11-22T12:00:00.000Z").map((alert) => alert.kind)).toContain(
      "sign-in-expired",
    );
  });

  test("a signed-out seat, another account and an API key sign-in raise alerts", () => {
    const start = watchAt(3, "2026-11-22T10:00:00Z");
    const kinds = (signIn: SignInStatus) =>
      seatAlerts(
        afterRead(start, outcome("2026-11-22T10:03:00.000Z", "signed-out", signIn)),
        "2026-11-22T10:04:00.000Z",
      ).map((alert) => alert.kind);

    expect(kinds({ ...signedIn, state: "signed-out", account: "unknown" })).toEqual(["signed-out"]);
    expect(kinds({ ...signedIn, state: "not-subscription" })).toEqual(["not-subscription"]);
    expect(kinds({ ...signedIn, account: "differs" })).toEqual(["other-account"]);
  });

  test("readings stop counting as current after three missed reads", () => {
    const watch = afterRead(
      watchAt(3, "2026-11-22T10:00:00Z"),
      outcome("2026-11-22T10:03:00.000Z"),
    );
    const failed = afterRead(watch, {
      reading: outcome("2026-11-22T10:13:00.000Z", "timeout").reading,
      signIn: undefined,
    });

    expect(failed.signIn).toEqual(signedIn);
    expect(seatAlerts(failed, "2026-11-22T10:33:00.000Z")).toEqual([]);
    expect(seatAlerts(failed, "2026-11-22T10:34:00.000Z")).toEqual([
      { seatId: "seat-a", kind: "readings-stopped" },
    ]);
  });

  test("a round that starts while one is still reading is skipped", async () => {
    const seat: SeatToRead = { id: "seat-a", configDir: "/seats/seat-a", account: undefined };
    const now = () => "2026-11-22T10:03:00.000Z";
    let finish: (value: SeatReadOutcome) => void = () => undefined;
    const reads: string[] = [];
    const rounds = new ReadRounds((read) => {
      reads.push(read.id);
      return new Promise((resolve) => {
        finish = resolve;
      });
    }, now);
    const watches = new Map([[seat.id, watchAt(3, "2026-11-22T10:00:00Z")]]);

    const first = rounds.run([seat], watches);
    const second = await rounds.run([seat], watches);
    finish(outcome(now()));
    const done = await first;

    expect(second).toEqual({ skipped: true, outcomes: [] });
    expect(done.skipped).toBe(false);
    expect(reads).toEqual(["seat-a"]);
    expect(watches.get("seat-a")?.nextReadAt).toBe("2026-11-22T10:13:00.000Z");
    expect((await rounds.run([seat], watches)).outcomes).toEqual([]);
  });
});
