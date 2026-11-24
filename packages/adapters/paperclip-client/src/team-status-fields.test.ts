import { teamStatusContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { connectTeam, seatsSummary, serveTeam, takenAt } from "./team-fixtures.test-helper.ts";

const seatsPath = "/api/plugins/halonic.seats/api/seats/summary";
const lastGood = "2026-11-24T09:50:00.000Z";
const lastGoodWindow = { kind: "five-hour", label: "5-hour window", usedPercent: 70 };

/** A seat of the plugin's summary whose newest read went as `lastError` says. */
function pluginSeat(id: string, lastError: string | undefined) {
  return {
    id,
    label: id,
    role: "pool",
    asOf: lastGood,
    readable: false,
    ...(lastError === undefined ? {} : { lastError }),
    windows: [lastGoodWindow],
    agents: [],
    manualResetUsed: false,
  };
}

/** The fixture's seats, plus one seat for each way a read can fail. */
const failedSeatsSummary = {
  ...seatsSummary,
  seats: [
    ...seatsSummary.seats,
    pluginSeat("pool-2", "rate-limited"),
    pluginSeat("pool-3", "timeout"),
    pluginSeat("pool-4", undefined),
  ],
};

let paperclip: FakePaperclip;

beforeEach(() => {
  paperclip = serveTeam(new FakePaperclip()).on("GET", seatsPath, { body: failedSeatsSummary });
});

verifies("paperclip-client.team-status-fields", () => {
  describe("failedRead", () => {
    it("gives a rate-limited seat its cause and keeps its last good reading", async () => {
      const seats = await connectTeam(paperclip).seats();
      const rateLimited = seats.find((seat) => seat.label === "pool-2");
      expect(rateLimited).toMatchObject({
        state: "not-read",
        failedRead: { cause: "rate-limited", at: takenAt },
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
    it("leaves out what the provider can't tell", async () => {
      const team = connectTeam(paperclip);
      const spend = await team.spend("today");
      const seats = await team.seats();
      expect(spend.map((summary) => summary.unknownSeatRuns)).toEqual([undefined]);
      expect([...spend, ...seats].filter((answer) => "fromCache" in answer)).toEqual([]);
    });
  });
});

teamStatusContract("Paperclip provider", () => {
  const fake = serveTeam(new FakePaperclip()).on("GET", seatsPath, { body: failedSeatsSummary });
  return Promise.resolve(connectTeam(fake));
});
