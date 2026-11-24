import type { PullRequest, PullRequestState } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { stuckReasons } from "./stuck-reasons.ts";

/** The fake clock every case reads: 24 Nov 13:00 UTC. */
const now = new Date("2026-11-24T13:00:00.000Z");

/** An acme pull request that has been in `state` for `minutes`. */
function pullRequest(state: PullRequestState, minutes: number, fastTrack = false): PullRequest {
  return {
    id: "acme-pr-1",
    source: "acme",
    repo: "app",
    label: "#12",
    title: "feat(app): a change",
    author: { kind: "agent", agent: "acme-bo", name: "Bo" },
    state,
    since: new Date(now.getTime() - minutes * 60 * 1000).toISOString(),
    fastTrack,
  };
}

verifies("team.pull-request-stuck", () => {
  describe("stuckReasons", () => {
    it.each([
      ["failing", 60, "failing"],
      ["conflicting", 60, "conflicting"],
      ["waiting-for-review", 240, "review-overdue"],
      ["dequeued", 60, "taken-out"],
      ["in-queue", 90, "queue-overdue"],
    ] as const)("counts %s as stuck only after %i minutes", (state, minutes, reason) => {
      expect(stuckReasons(pullRequest(state, minutes), now)).toEqual([]);
      expect(stuckReasons(pullRequest(state, minutes + 1), now)).toEqual([reason]);
    });

    it("counts a Fast-track PR waiting for review as stuck after 30 minutes", () => {
      expect(stuckReasons(pullRequest("waiting-for-review", 30, true), now)).toEqual([]);
      expect(stuckReasons(pullRequest("waiting-for-review", 31, true), now)).toEqual([
        "review-overdue",
      ]);
    });

    it("counts an approval on an older head as stuck at once", () => {
      expect(stuckReasons(pullRequest("approval-outdated", 0), now)).toEqual(["approval-outdated"]);
    });

    it("counts a PR whose task is done, or blocked by a task that's done, as stuck", () => {
      const fresh = pullRequest("waiting-for-review", 5);
      expect(stuckReasons(fresh, now, { state: "done", blockedByDone: false })).toEqual([
        "task-stalled",
      ]);
      expect(stuckReasons(fresh, now, { state: "blocked", blockedByDone: true })).toEqual([
        "task-stalled",
      ]);
      expect(stuckReasons(fresh, now, { state: "blocked", blockedByDone: false })).toEqual([]);
      expect(stuckReasons(fresh, now, { state: "in-progress", blockedByDone: false })).toEqual([]);
    });

    it("gives both reasons when a PR fails and its task is stalled", () => {
      expect(
        stuckReasons(pullRequest("failing", 120), now, {
          state: "cancelled",
          blockedByDone: false,
        }),
      ).toEqual(["failing", "task-stalled"]);
    });

    it("never counts a draft or an approved PR as stuck by its age", () => {
      expect(stuckReasons(pullRequest("draft", 60 * 24 * 9), now)).toEqual([]);
      expect(stuckReasons(pullRequest("approved", 60 * 24), now)).toEqual([]);
    });
  });
});
