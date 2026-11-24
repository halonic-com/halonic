import { FakeAgentMessaging, FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { PullRequests } from "./pull-requests.ts";

const now = new Date("2026-11-24T13:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString();

/** A fake with one acme source, read at 13:00 UTC. */
function acme(parts: { pullRequests?: boolean } = {}) {
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource(parts);
  return { team, source };
}

verifies("team.pull-request-stuck", () => {
  describe("PullRequests", () => {
    it("says the connection may not read pull requests when its source doesn't serve them", async () => {
      const { team } = acme({ pullRequests: false });
      const read = await new PullRequests(team, undefined, { now: () => now }).read();
      expect(read).toEqual({ kind: "no-access" });
    });

    it("says no snapshot has arrived when the source serves pull requests but has none", async () => {
      const { team } = acme();
      const read = await new PullRequests(team, undefined, { now: () => now }).read();
      expect(read).toEqual({ kind: "no-snapshot" });
    });

    it("gives each open PR why it's stuck, its task and its queue line", async () => {
      const { team, source } = acme();
      const messaging = new FakeAgentMessaging();
      const tasks = messaging.addSource({ label: "Paperclip · Acme" });
      const done = messaging.addWork(tasks.id, { label: "ACME-6", title: "Before", state: "done" });
      const task = messaging.addWork(tasks.id, {
        label: "ACME-7",
        title: "A change",
        state: "blocked",
        blockedBy: [done.id],
      });
      team.setMergeQueue(source, {
        groups: [{ position: 1, state: "building", since: minutesAgo(9), pullRequests: [] }],
      });
      team.addPullRequest(source, { label: "#1", title: "a", work: task.id, since: minutesAgo(5) });
      team.addPullRequest(source, {
        label: "#2",
        title: "b",
        state: "in-queue",
        queue: { position: 1, group: 1 },
      });
      const read = await new PullRequests(team, messaging, { now: () => now }).read();
      if (read.kind !== "read") throw new Error(`read ${read.kind}`);
      expect(read.rows.map((row) => [row.task?.label, row.stuck, row.queue])).toEqual([
        ["ACME-7", ["task-stalled"], undefined],
        [undefined, [], { total: 1, groupSince: minutesAgo(9) }],
      ]);
    });

    it("still gives the rows, with no tasks, when the tasks can't be read", async () => {
      const { team, source } = acme();
      team.addPullRequest(source, { label: "#1", title: "a" });
      const messaging = new FakeAgentMessaging();
      vi.spyOn(messaging, "listWork").mockRejectedValue(new Error("connection reset"));
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const read = await new PullRequests(team, messaging, { now: () => now }).read();
      expect(read.kind === "read" ? read.rows.map((row) => row.task) : read).toEqual([undefined]);
      expect(logged).toHaveBeenCalledOnce();
      logged.mockRestore();
    });
  });
});
