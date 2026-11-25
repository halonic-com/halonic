import { teamStatusContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import {
  connectTeam,
  seatsSummary,
  serveTeam,
  takenAt,
  teamNow,
} from "./team-fixtures.test-helper.ts";
import { rangeStart } from "./team-spend.ts";

const seatsPath = "/api/plugins/halonic.seats/api/seats/summary";
const lastGood = "2026-11-24T09:50:00.000Z";
const lastGoodWindow = { kind: "five-hour", label: "5-hour window", usedPercent: 70 };
const failedAt = "2026-11-24T09:55:00.000Z";

/** A seat of the plugin's summary whose newest read went as `lastError` says. */
function pluginSeat(id: string, lastError: string | undefined, failedReadAt?: string) {
  return {
    id,
    label: id,
    role: "pool",
    asOf: lastGood,
    readable: false,
    ...(lastError === undefined ? {} : { lastError }),
    ...(failedReadAt === undefined ? {} : { failedReadAt }),
    windows: [lastGoodWindow],
    agents: [],
    manualResetUsed: false,
  };
}

/**
 * The fixture's seats, plus one seat for each way a read can fail. The
 * timed-out seat has no `failedReadAt`, as a plugin from before HAL-17898
 * sends it. The plugin counts unknown-seat runs only for a `from` it got.
 */
const failedSeatsSummary = {
  ...seatsSummary,
  seats: [
    ...seatsSummary.seats,
    pluginSeat("pool-2", "rate-limited", failedAt),
    pluginSeat("pool-3", "timeout"),
    pluginSeat("pool-4", undefined),
  ],
};

let paperclip: FakePaperclip;

beforeEach(() => {
  paperclip = serveTeam(new FakePaperclip()).on("GET", seatsPath, ({ query }) => ({
    body: query.has("from") ? { ...failedSeatsSummary, unknownSeatRuns: 3 } : failedSeatsSummary,
  }));
});

verifies("paperclip-client.team-status-fields", () => {
  describe("failedRead", () => {
    it("gives a rate-limited seat its cause and time and keeps its last good reading", async () => {
      const seats = await connectTeam(paperclip).seats();
      const rateLimited = seats.find((seat) => seat.label === "pool-2");
      expect(rateLimited).toMatchObject({
        state: "not-read",
        failedRead: { cause: "rate-limited", at: failedAt },
        asOf: lastGood,
        windows: [lastGoodWindow],
      });
    });

    it("reads any other error as other, and gives none to a signed-out or unerrored seat", async () => {
      const seats = await connectTeam(paperclip).seats();
      const byLabel = new Map(seats.map((seat) => [seat.label, seat]));
      expect(byLabel.get("pool-3")?.failedRead).toEqual({ cause: "other", at: takenAt });
      expect(byLabel.get("reserve-1")?.state).toBe("signed-out");
      expect(byLabel.get("reserve-1")?.failedRead).toBeUndefined();
      expect(byLabel.get("pool-4")?.state).toBe("not-read");
      expect(byLabel.get("pool-4")?.failedRead).toBeUndefined();
    });
  });

  describe("unknownSeatRuns and fromCache", () => {
    it("counts the range's runs with no seat from the seats plugin", async () => {
      const spend = await connectTeam(paperclip).spend("week");
      expect(spend.map((summary) => summary.unknownSeatRuns)).toEqual([3]);
      const seatsRead = paperclip.seen.find((request) => request.path === seatsPath);
      expect(seatsRead?.query.get("from")).toBe(rangeStart("week", teamNow));
    });

    it("leaves unknownSeatRuns out when the seats plugin isn't installed or doesn't count", async () => {
      const withoutPlugin = serveTeam(new FakePaperclip()).on("GET", seatsPath, { status: 404 });
      const olderPlugin = serveTeam(new FakePaperclip());
      for (const fake of [withoutPlugin, olderPlugin]) {
        const spend = await connectTeam(fake).spend("today");
        expect(spend.map((summary) => summary.unknownSeatRuns)).toEqual([undefined]);
      }
    });

    it("carries no fromCache, because the provider reads live", async () => {
      const team = connectTeam(paperclip);
      const spend = await team.spend("today");
      const seats = await team.seats();
      expect([...spend, ...seats].filter((answer) => "fromCache" in answer)).toEqual([]);
    });
  });
});

teamStatusContract("Paperclip provider", () => {
  const fake = serveTeam(new FakePaperclip()).on("GET", seatsPath, { body: failedSeatsSummary });
  return Promise.resolve(connectTeam(fake));
});
