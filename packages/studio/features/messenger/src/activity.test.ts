import type { PullRequest, PullRequestList, TeamRun, TeamRuns } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { activityView } from "./activity.ts";
import { activityWords } from "./activity-words.ts";
import type { ConversationRow } from "./messenger.ts";

const now = new Date("2026-11-26T14:09:00Z");
const chief = "acme:agent:chief";

function rowOf(agentWorking = false): ConversationRow {
  return {
    conversation: {
      id: "acme:chat:1",
      source: "acme",
      agent: chief,
      title: "Where are we on the launch?",
      updatedAt: "2026-11-26T14:02:00Z",
      waitingForMe: false,
      agentWorking,
    },
    agents: [],
    sourceAgents: [],
    source: undefined,
  };
}

function run(fields: Partial<TeamRun>): TeamRun {
  return {
    id: "acme:run:3f9c2a71",
    source: "acme",
    agent: chief,
    task: { id: "acme:task:7", identifier: "ACME-7", title: "Ship the site" },
    state: "running",
    startedAt: "2026-11-26T14:02:00Z",
    lastActivityAt: "2026-11-26T14:08:30Z",
    canStop: true,
    ...fields,
  };
}

function runsOf(...runs: TeamRun[]): TeamRuns[] {
  return [{ source: "acme", asOf: now.toISOString(), runs, complete: true }];
}

function pull(fields: Partial<PullRequest>): PullRequest {
  return {
    id: "acme:pr:12",
    source: "acme",
    repo: "site",
    label: "#12",
    title: "feat: the launch page",
    author: { kind: "agent", agent: chief, name: "Chief" },
    work: "acme:task:7",
    state: "approved",
    since: "2026-11-26T14:05:00Z",
    fastTrack: false,
    ...fields,
  };
}

function pullsOf(...open: PullRequest[]): PullRequestList[] {
  return [{ source: "acme", repo: "site", asOf: now.toISOString(), open, recent: [] }];
}

verifies("messenger.activity-panel", () => {
  describe("activityView", () => {
    it("shows a running run with its task, its time and the pull requests its branch names", () => {
      const other = pull({ id: "acme:pr:13", label: "#13", work: "acme:task:9" });
      const view = activityView(rowOf(), runsOf(run({})), pullsOf(pull({}), other), now);
      expect(view).toMatchObject({
        kind: "working",
        quiet: false,
        task: { onChat: false, identifier: "ACME-7", title: "Ship the site", run: "3f9c2a" },
      });
      expect(view.kind === "working" && view.pullRequests.map((each) => each.label)).toEqual([
        "#12",
      ]);
    });

    it("says the run answers this chat when the chat's agent works on it, with the chat's title", () => {
      const view = activityView(rowOf(true), runsOf(run({})), pullsOf(pull({})), now);
      expect(view).toMatchObject({
        kind: "working",
        task: { onChat: true, title: "Where are we on the launch?" },
        pullRequests: [],
      });
    });

    it("turns quiet after 10 minutes without activity", () => {
      const view = activityView(
        rowOf(),
        runsOf(run({ lastActivityAt: "2026-11-26T13:57:00Z" })),
        [],
        now,
      );
      expect(view).toMatchObject({ kind: "working", quiet: true });
    });

    it("shows a queued run as starting", () => {
      const queued = run({ state: "queued", lastActivityAt: "2026-11-26T14:02:00Z" });
      delete queued.startedAt;
      expect(activityView(rowOf(), runsOf(queued), [], now)).toMatchObject({ kind: "queued" });
    });

    it("shows the newest finished run with its outcome once nothing runs", () => {
      const done = run({ state: "succeeded", finishedAt: "2026-11-26T13:00:00Z" });
      const failed = run({ id: "acme:run:9", state: "failed", finishedAt: "2026-11-26T14:09:00Z" });
      expect(activityView(rowOf(), runsOf(done, failed), [], now)).toMatchObject({
        kind: "ended",
        outcome: "failed",
      });
      const lost = run({ state: "interrupted", finishedAt: "2026-11-26T14:09:00Z" });
      expect(activityView(rowOf(), runsOf(lost), [], now)).toMatchObject({ outcome: "stopped" });
    });

    it("leaves out other agents' runs, and is idle with none of its own", () => {
      const others = run({ agent: "acme:agent:liam" });
      expect(activityView(rowOf(), runsOf(others), [], now)).toEqual({ kind: "idle" });
    });
  });

  describe("activityWords", () => {
    it("says minutes, then hours and minutes from an hour on", () => {
      expect(activityWords.forMinutes(7)).toBe("for 7 min");
      expect(activityWords.forMinutes(80)).toBe("for 1 h 20 min");
      expect(activityWords.lastActivity(120)).toBe("Last activity 2 h ago");
    });
  });
});
