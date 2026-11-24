import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { findRequest, paperclipRequests } from "./requests.ts";
import { connectTeam, serveTeam } from "./team-fixtures.test-helper.ts";

const company = "/api/companies/:company";

verifies("paperclip-client.team-status", () => {
  describe("the team status request list", () => {
    it("has exactly the spend and seat rows, every one a GET pinned to its path", () => {
      const names = Object.keys(paperclipRequests);
      const rows = Object.fromEntries(
        Object.entries(paperclipRequests).slice(
          names.indexOf("spendSummary"),
          names.indexOf("seatsSummary") + 1,
        ),
      );
      expect(rows).toEqual({
        spendSummary: { method: "GET", path: `${company}/costs/summary` },
        spendByProvider: { method: "GET", path: `${company}/costs/by-provider` },
        spendByAgent: { method: "GET", path: `${company}/costs/by-agent` },
        spendByAgentModel: { method: "GET", path: `${company}/costs/by-agent-model` },
        budgetsOverview: { method: "GET", path: `${company}/budgets/overview` },
        seatsSummary: { method: "GET", path: "/api/plugins/halonic.seats/api/seats/summary" },
      });
    });

    it("reaches no other plugin route and no write", () => {
      const offList: readonly (readonly [string, string])[] = [
        ["GET", "/api/plugins/halonic.seats/api/seats/page"],
        ["GET", "/api/plugins/halonic.seats/api/seats"],
        ["POST", "/api/plugins/halonic.seats/api/seats/pool-1/manual-reset"],
        ["POST", "/api/plugins/halonic.seats/api/seats/summary"],
        ["GET", "/api/plugins/other.plugin/api/seats/summary"],
        ["GET", "/api/companies/c1/costs/quota-windows"],
        ["PATCH", "/api/companies/c1/budgets/overview"],
        ["POST", "/api/companies/c1/budgets/overview"],
      ];
      for (const [method, path] of offList) {
        expect(findRequest(method, path), `${method} ${path}`).toBeUndefined();
      }
    });

    it("sends only GET requests on the list for every read", async () => {
      const paperclip = serveTeam(new FakePaperclip());
      const team = connectTeam(paperclip);
      await team.spend("month");
      await team.agentSpend("week");
      await team.seats();
      expect(paperclip.seen).toHaveLength(6);
      for (const request of paperclip.seen) {
        expect(request.method).toBe("GET");
        expect(findRequest(request.method, request.path), request.path).toBeDefined();
      }
    });
  });
});
