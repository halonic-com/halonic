import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, agentBo } from "./acme-data.test-helper.ts";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { connectTeam, seatsSummary, serveTeam, takenAt } from "./team-fixtures.test-helper.ts";

const source = "paperclip:acme";
const ada = `${source}:agent:${agentAda}`;
const bo = `${source}:agent:${agentBo}`;
const seatsPath = "/api/plugins/halonic.seats/api/seats/summary";

let paperclip: FakePaperclip;

beforeEach(() => {
  paperclip = serveTeam(new FakePaperclip());
});

verifies("paperclip-client.team-status", () => {
  describe("spend", () => {
    it("counts paid money only, with the tokens of all work, from the range's start", async () => {
      const [summary] = await connectTeam(paperclip).spend("today");
      expect(summary).toEqual({
        source,
        range: "today",
        asOf: "2026-11-24T10:10:00.000Z",
        paid: { cents: 1234, currency: "USD" },
        tokens: { input: 31000, cached: 905000, output: 7200 },
        budget: { cents: 50000, currency: "USD" },
        unpricedRuns: 2,
      });
      const froms = paperclip.seen.map((request) => request.query.get("from"));
      // The two cost routes, then the seats summary for the runs with no seat.
      expect(froms).toEqual(Array(3).fill("2026-11-24T00:00:00.000Z"));
      await connectTeam(paperclip).spend("month");
      expect(paperclip.seen.at(-1)?.query.get("from")).toBe("2026-11-01T00:00:00.000Z");
    });

    it("shows a subscription agent as 0 paid with its tokens, by model", async () => {
      const spend = await connectTeam(paperclip).agentSpend("week");
      const adaSpend = spend.find((row) => row.agent === ada);
      expect(adaSpend?.paid).toEqual({ cents: 0, currency: "USD" });
      expect(adaSpend?.tokens).toEqual({ input: 30000, cached: 900000, output: 7000 });
      expect(adaSpend?.tokensByModel.map((row) => row.model)).toEqual(["sonnet", "opus"]);
      expect(adaSpend?.budget).toBeUndefined();
      const boSpend = spend.find((row) => row.agent === bo);
      expect(boSpend?.paid.cents).toBe(1234);
      expect(boSpend?.budget).toEqual({ cents: 10000, currency: "USD" });
    });
  });

  describe("seats", () => {
    it("maps labels, windows and states, and nothing else of the answer", async () => {
      const [pool, reserve] = await connectTeam(paperclip).seats();
      expect(pool).toMatchObject({
        id: `${source}:seat:pool-1`,
        label: "pool-1",
        role: "pool",
        state: "near-limit",
        asOf: "2026-11-24T09:58:00.000Z",
        agents: [ada],
        manualReset: "available",
        proposal: { text: "Move Ada to reserve-1.", at: takenAt },
      });
      expect(pool?.windows.map((window) => window.kind)).toEqual(["five-hour", "week"]);
      expect(reserve).toMatchObject({ state: "signed-out", manualReset: "none", asOf: takenAt });
      expect(reserve?.proposal).toBeUndefined();
      expect(Object.keys(reserve ?? {}).sort()).toEqual([
        "agents",
        "asOf",
        "id",
        "label",
        "manualReset",
        "role",
        "source",
        "state",
        "windows",
      ]);
    });
  });

  describe("parts and changes", () => {
    it("says a part isn't served when its plugin answers 404, and serves it again after", async () => {
      paperclip.routes.delete(`GET ${seatsPath}`);
      const team = connectTeam(paperclip);
      await expect(team.seats()).resolves.toEqual([]);
      await expect(team.parts()).resolves.toMatchObject([{ source, spend: true, seats: false }]);
      paperclip.on("GET", seatsPath, { body: seatsSummary });
      await team.seats();
      await expect(team.parts()).resolves.toMatchObject([{ seats: true }]);
    });

    it("names the source when a refresh finds a change", async () => {
      const team = connectTeam(paperclip);
      const changes = team.changes()[Symbol.asyncIterator]();
      await team.refresh();
      paperclip.on("GET", seatsPath, { body: { ...seatsSummary, seats: [] } });
      await team.refresh();
      await expect(changes.next()).resolves.toEqual({ done: false, value: source });
    });
  });
});
