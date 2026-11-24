import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, agentBo, company } from "./acme-data.test-helper.ts";
import { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { findRequest, paperclipRequests } from "./requests.ts";
import { connectTeam, pull, serveTeam, takenAt } from "./team-fixtures.test-helper.ts";

const source = "paperclip:acme";
const ada = `${source}:agent:${agentAda}`;
const bo = `${source}:agent:${agentBo}`;
const pullId = (number: number | string) => `${source}:pull:acme%2Fapp:${number}`;
const agentTools = "/api/plugins/halonic.agent-tools/api";
const summaryPath = `${agentTools}/github/summary`;

let paperclip: FakePaperclip;

beforeEach(() => {
  paperclip = serveTeam(new FakePaperclip());
});

/** Serves a GitHub summary whose one repository holds only `open`. */
function serveOpen(repo: string, open: readonly object[]): void {
  paperclip.on("GET", summaryPath, {
    body: { takenAt, repos: [{ repo, open, recent: [], queue: [] }], mergeSpeed: null },
  });
}

verifies("paperclip-client.team-pull-requests", () => {
  describe("the pull request request list", () => {
    it("has exactly the two agent-tools rows, each a GET pinned to its path", () => {
      const names = Object.keys(paperclipRequests);
      const rows = Object.fromEntries(
        Object.entries(paperclipRequests).slice(
          names.indexOf("pullRequestsSummary"),
          names.indexOf("pullRequestDetail") + 1,
        ),
      );
      expect(rows).toEqual({
        pullRequestsSummary: { method: "GET", path: summaryPath },
        pullRequestDetail: { method: "GET", path: `${agentTools}/github/pr/:number` },
      });
    });

    it("reaches no other agent-tools route, and a number is a positive integer", () => {
      const offList: readonly (readonly [string, string])[] = [
        ["GET", `${agentTools}/board-check`],
        ["POST", summaryPath],
        ["GET", "/api/plugins/other.plugin/api/github/summary"],
        ["GET", `${agentTools}/github/pr/0`],
        ["GET", `${agentTools}/github/pr/-1`],
        ["GET", `${agentTools}/github/pr/abc`],
        ["GET", `${agentTools}/github/pr/1234567890`],
        ["GET", `${agentTools}/github/pr/1%2F..`],
      ];
      for (const [method, path] of offList) {
        expect(findRequest(method, path), `${method} ${path}`).toBeUndefined();
      }
      expect(findRequest("GET", `${agentTools}/github/pr/5641`)).toBe("pullRequestDetail");
    });

    it("sends nothing for a pull request ID whose number the route would refuse", async () => {
      const team = connectTeam(paperclip);
      for (const number of ["0", "-1", "1%2F..", "abc"]) {
        await expect(team.pullRequest(pullId(number))).resolves.toBeUndefined();
      }
      expect(paperclip.seen).toEqual([]);
    });
  });

  describe("pull requests", () => {
    it("names the board, an outside contributor and an agent, never a login", async () => {
      const [list] = await connectTeam(paperclip).pullRequests();
      const byLabel = new Map(list?.open.map((pr) => [pr.label, pr]));
      expect(byLabel.get("#13")?.author).toEqual({ kind: "person", name: "the board" });
      expect(byLabel.get("#14")?.author).toEqual({ kind: "person", name: "outside contributor" });
      expect(byLabel.get("#11")?.author).toEqual({ kind: "agent", agent: ada, name: "Ada" });
      expect(byLabel.get("#11")?.reviewer).toEqual({ kind: "agent", agent: bo, name: "Bo" });

      serveOpen("acme/app", [
        pull(20, { author: { kind: "person", name: "some-login" } }),
        pull(21, { author: { kind: "agent", name: "not-an-agent" } }),
      ]);
      const [hostile] = await connectTeam(paperclip).pullRequests();
      expect(hostile?.open.map((pr) => pr.author)).toEqual([
        { kind: "person", name: "outside contributor" },
        { kind: "person", name: "outside contributor" },
      ]);
    });

    it("maps states, reasons, the queue and the work", async () => {
      const [list] = await connectTeam(paperclip).pullRequests();
      expect(list).toMatchObject({ source, repo: "app", asOf: takenAt });
      const states = list?.open.map((pr) => [pr.label, pr.state, pr.reason]);
      expect(states).toEqual([
        ["#11", "in-queue", undefined],
        ["#12", "in-queue", undefined],
        ["#13", "failing", "typecheck"],
        ["#14", "waiting-for-review", undefined],
        ["#15", "dequeued", "group failed"],
      ]);
      expect(list?.open[0]).toMatchObject({
        queue: { position: 1, group: 1 },
        work: `${source}:task:ACME-7`,
      });
      expect(list?.open[1]?.queue).toEqual({ position: 2 });
      expect(list?.recent).toMatchObject([
        { label: "#10", state: "merged", since: "2026-11-24T07:00:00.000Z" },
      ]);
    });

    it("links each one through isAllowedWebLink, and drops a link that fails it", async () => {
      const [list] = await connectTeam(paperclip).pullRequests();
      expect(list?.open[0]?.webLink).toBe("https://github.com/acme/app/pull/11");

      serveOpen("../app", [pull(7)]);
      const [hostile] = await connectTeam(paperclip).pullRequests();
      expect(hostile?.open[0]?.label).toBe("#7");
      expect(hostile?.open[0]).not.toHaveProperty("webLink");
    });

    it("reads one pull request's detail by its number and repository", async () => {
      const detail = await connectTeam(paperclip).pullRequest(pullId(13));
      expect(detail?.pullRequest).toMatchObject({ label: "#13", state: "failing" });
      expect(detail?.timeline).toEqual([{ at: takenAt, kind: "check-failed", text: "typecheck" }]);
      const request = paperclip.seen.find((seen) => seen.path.endsWith("/github/pr/13"));
      expect(request?.query.get("repo")).toBe("acme/app");
      expect(request?.query.get("companyId")).toBe(company);
      await expect(connectTeam(paperclip).pullRequest(pullId(99))).resolves.toBeUndefined();
    });

    it("has no lists before the first snapshot, and none without the plugin", async () => {
      paperclip.on("GET", summaryPath, { body: { takenAt: null, repos: [], mergeSpeed: null } });
      const team = connectTeam(paperclip);
      await expect(team.pullRequests()).resolves.toEqual([]);
      await expect(team.mergeQueue()).resolves.toEqual([]);
      paperclip.routes.delete(`GET ${summaryPath}`);
      await expect(team.pullRequests()).resolves.toEqual([]);
      await expect(team.parts()).resolves.toMatchObject([{ pullRequests: false }]);
    });
  });

  describe("the merge queue", () => {
    it("groups entries, waits on runners and lists today's removals", async () => {
      const [queue] = await connectTeam(paperclip).mergeQueue();
      expect(queue).toEqual({
        source,
        repo: "app",
        asOf: takenAt,
        health: "runners-busy",
        runnerWaitMinutes: 10,
        medianMinutesToMerge: 42,
        groups: [
          {
            position: 1,
            state: "building",
            since: "2026-11-24T09:30:00.000Z",
            pullRequests: [pullId(11)],
          },
        ],
        waiting: [pullId(12)],
        removedToday: [
          { pullRequest: pullId(15), at: "2026-11-24T09:00:00.000Z", reason: "group failed" },
        ],
      });
    });
  });
});
