import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import { fakeMetrics, fakeState } from "../plugin/fake-host.test-helper.ts";
import { registerTools, type ToolsApi } from "../plugin/tools.ts";
import type { OpenFacts, QueueEntry, Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import { saveSnapshot } from "../snapshot/store.ts";
import { queueState, queueStateText } from "./queue-state.ts";

const repo = "acme/rockets";

function entry(number: number, position: number, extra: Partial<QueueEntry> = {}): QueueEntry {
  return {
    number,
    position,
    state: "AWAITING_CHECKS",
    enqueuedAt: "2026-11-22T14:40:00Z",
    enqueuedBy: "board-member",
    groupHead: "a1b2c3d",
    estimatedSeconds: 600,
    solo: false,
    groupCiOk: "pending",
    jobsWaiting: 2,
    waitingSince: "2026-11-22T14:58:00Z",
    ...extra,
  };
}

function pull(number: number, branch: string, open: Partial<OpenFacts> = {}): SnapshotPull {
  return {
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state: "open",
    branch,
    headRepo: repo,
    base: "main",
    head: "f00d",
    updatedAt: "2026-11-22T14:00:00Z",
    mergedAt: null,
    mergeCommit: null,
    open: {
      draft: false,
      mergeable: "yes",
      ciOk: "success",
      draftCiOk: "missing",
      inQueue: false,
      labels: [],
      finding: null,
      approvals: [],
      ...open,
    },
  };
}

function snapshot(queue: readonly QueueEntry[], takenAt = "2026-11-22T15:00:00Z"): Snapshot {
  return {
    version: 1,
    takenAt,
    closedWindowDays: 3,
    repos: [
      {
        repo,
        defaultBranch: "main",
        queue,
        pulls: [
          pull(41, "ada/HAL-41-fuel", { inQueue: true }),
          pull(42, "ada/HAL-42-fins", {
            labels: [
              { name: "fast-track", addedBy: "board-member", addedAt: "2026-11-22T14:10:00Z" },
            ],
          }),
          pull(43, "bob/HAL-43-nose", {
            labels: [{ name: "fast-track", addedBy: null, addedAt: null }],
          }),
        ],
      },
    ],
  };
}

const at = new Date("2026-11-22T15:05:00Z");

verifies("paperclip.queue-state", () => {
  describe("queue_state", () => {
    test("lists the queue in order and counts each group's waiting jobs once", () => {
      const state = queueState(snapshot([entry(44, 2), entry(41, 1)]), at);
      const [acme] = state.repos;
      expect(acme?.entries.map((row) => [row.position, row.number, row.task])).toEqual([
        [1, 41, "HAL-41"],
        [2, 44, undefined],
      ]);
      expect(acme?.entries[0]).toMatchObject({ minutesInQueue: 25, groupCiOk: "pending" });
      expect(acme?.runnerWait).toEqual({ jobs: 2, longestMinutes: 7 });
      expect(state).toMatchObject({ ageMinutes: 5, stale: false });
    });

    test("names who added fast-track, and an unknown adder never as allowed", () => {
      const state = queueState(snapshot([]), at);
      expect(state.repos[0]?.fastTrack.map((row) => [row.number, row.addedBy])).toEqual([
        [42, "board-member"],
        [43, null],
      ]);
      const text = queueStateText(state);
      expect(text).toContain("fast-track #42 (HAL-42): added by board-member");
      expect(text).toContain("added by unknown (GitHub doesn't say; never counts as allowed)");
      expect(text).toContain("no merge-group job waits for a runner");
    });

    test("says when the snapshot is stale or older than the group fields", () => {
      const old = entry(41, 1);
      delete (old as { groupCiOk?: unknown }).groupCiOk;
      delete (old as { jobsWaiting?: unknown }).jobsWaiting;
      const state = queueState(snapshot([old], "2026-11-22T14:20:00Z"), at);
      expect(state).toMatchObject({ ageMinutes: 45, stale: true });
      expect(state.repos[0]?.entries[0]?.groupCiOk).toBe("unknown");
      expect(state.repos[0]?.runnerWait).toBeNull();
      const text = queueStateText(state);
      expect(text).toContain("STALE");
      expect(text).toContain("runner wait not in this snapshot yet");
    });

    test("answers from plugin state with no GitHub request, and with an error before the first pass", async () => {
      type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;
      const handlers = new Map<string, Handler>();
      const sent: string[] = [];
      const { state } = fakeState();
      const ctx = {
        metrics: fakeMetrics().metrics,
        state,
        tools: { register: (name: string, _d: unknown, fn: Handler) => handlers.set(name, fn) },
        agents: { get: async () => null },
        config: { get: async () => ({}) },
        secrets: { resolve: async () => "test-token" },
        http: {
          fetch: async (url: string) => {
            sent.push(url);
            return new Response(null, { status: 404 });
          },
        },
      };
      registerTools(ctx as unknown as ToolsApi);
      const call = (companyId: string) =>
        handlers.get("queue_state")?.({}, { agentId: "a", runId: "r", companyId, projectId: "" });
      await saveSnapshot(ctx, "acme", snapshot([entry(41, 1)]));
      const answer = await call("acme");
      expect(answer?.content).toContain("1. #41 (HAL-41): AWAITING_CHECKS, group ci-ok pending");
      expect(await call("globex")).toEqual({
        error: "queue_state: no GitHub snapshot yet; the PR watcher hasn't finished a pass.",
      });
      expect(sent).toEqual([]);
    });
  });
});
