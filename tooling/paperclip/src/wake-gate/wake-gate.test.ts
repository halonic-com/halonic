import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { Snapshot } from "../snapshot/shape.ts";
import {
  fakeDeps,
  mergedPull,
  minutesAgo,
  monitorWake,
  now,
  openPull,
  repo,
  snapshot,
} from "../state-packet/fakes.test-helper.ts";
import type { PullLine } from "../state-packet/pull-line.ts";
import { type GateDeps, type GateMode, gateReport } from "./gate.ts";
import { waitingFor, wakeVerdict } from "./verdict.ts";

/** HAL-41's pull request #41: green, mergeable, approved and second in the queue, unless changed. */
function line(change: Partial<PullLine> = {}): PullLine {
  return {
    repo,
    number: 41,
    state: "open",
    draft: false,
    commit: "f00d0001",
    ciOk: "success",
    mergeable: "yes",
    approvedBy: ["Liam"],
    queue: 2,
    dataAsOf: now.toISOString(),
    ...change,
  };
}

interface GateInput {
  readonly mode?: GateMode;
  readonly snapshot?: Snapshot;
  /** The newest comment's author id: null for a person, undefined with no comments. */
  readonly newestBy?: string | null;
  readonly githubFails?: boolean;
}

/** The gate's fakes on top of the packet's; HAL-41 is held by `agent-ada`. */
function gateDeps(input: GateInput): { deps: GateDeps; reads: string[] } {
  const packet = fakeDeps({
    ...(input.snapshot === undefined ? {} : { snapshot: input.snapshot }),
    ...(input.githubFails === undefined ? {} : { githubFails: input.githubFails }),
  });
  const deps: GateDeps = {
    ...packet.deps,
    mode: async () => input.mode ?? "measure",
    task: async (issueId) =>
      issueId === "task-41" ? { identifier: "HAL-41", assigneeAgentId: "agent-ada" } : undefined,
    newestCommentBy: async () => ("newestBy" in input ? input.newestBy : "agent-ada"),
  };
  return { deps, reads: packet.reads };
}

verifies("paperclip.wake-gate", () => {
  describe("what a pull request waits for", () => {
    test("green and in the queue, approved, or waiting for a review: someone else's turn", () => {
      expect(waitingFor(line())).toBe("the merge queue");
      expect(waitingFor(line({ queue: false }))).toBe("the merge (approved)");
      expect(waitingFor(line({ queue: false, approvedBy: [] }))).toBe("a review");
    });

    test("ci-ok still running, on the head or the merge commit: waiting", () => {
      expect(waitingFor(line({ ciOk: "pending" }))).toBe("ci-ok on its head");
      expect(waitingFor(line({ state: "merged", ciOk: "pending" }))).toBe(
        "ci-ok on its merge commit",
      );
    });

    test.each([
      ["a draft", line({ draft: true })],
      ["a conflict", line({ mergeable: "conflict" })],
      ["a red ci-ok", line({ ciOk: "failure" })],
      ["no ci-ok at all", line({ ciOk: "missing" })],
      ["closed without merging", line({ state: "closed" })],
      ["merged and landed", line({ state: "merged", ciOk: "success" })],
      ["merged and red on main", line({ state: "merged", ciOk: "failure" })],
    ])("%s is the author's to act on", (_, pull) => {
      expect(waitingFor(pull)).toBeUndefined();
    });
  });

  describe("the verdict", () => {
    test("every pull request waiting and only the holder's own comment: would skip", () => {
      expect(
        wakeVerdict([line(), line({ number: 42, ciOk: "pending" })], { by: "holder" }),
      ).toEqual({
        kind: "skip",
        why: `${repo}#41 waits for the merge queue; ${repo}#42 waits for ci-ok on its head`,
      });
      expect(wakeVerdict([line()], { by: "none" }).kind).toBe("skip");
    });

    test("one pull request that needs its author makes the run start", () => {
      expect(
        wakeVerdict([line(), line({ number: 42, ciOk: "failure" })], { by: "holder" }),
      ).toEqual({ kind: "run", why: `${repo}#42 needs its author` });
    });

    test("a newer comment from anyone else makes the run start", () => {
      expect(wakeVerdict([line()], { by: "other" })).toEqual({
        kind: "run",
        why: "the newest comment is from someone else",
      });
    });

    test("no pull request: the run starts", () => {
      expect(wakeVerdict([], { by: "none" }).kind).toBe("run");
    });
  });

  describe("the gate on a wake", () => {
    test("a green, queued pull request and the holder's hand-off: would skip, nothing read from GitHub", async () => {
      const { deps, reads } = gateDeps({});
      expect(await gateReport(monitorWake, deps)).toEqual({
        task: "HAL-41",
        verdict: { kind: "skip", why: `${repo}#41 waits for the merge queue` },
      });
      expect(reads).toEqual([]);
    });

    test("a comment from a person makes it run", async () => {
      const { deps } = gateDeps({ newestBy: null });
      const report = await gateReport(monitorWake, deps);
      expect(report?.verdict).toEqual({
        kind: "run",
        why: "the newest comment is from someone else",
      });
    });

    test("a stale line is read again first: #41 is red now, so it runs", async () => {
      const { deps, reads } = gateDeps({
        snapshot: snapshot([openPull(41, "ada/HAL-41-fuel")], minutesAgo(7)),
      });
      const report = await gateReport(monitorWake, deps);
      expect(report?.verdict).toEqual({ kind: "run", why: `${repo}#41 needs its author` });
      expect(reads).toEqual([`status ${repo}#41`]);
    });

    test("a merged pull request that landed: the run starts to close the task", async () => {
      const { deps } = gateDeps({ snapshot: snapshot([mergedPull(41, "ada/HAL-41-fuel")]) });
      expect((await gateReport(monitorWake, deps))?.verdict?.kind).toBe("run");
    });

    test("no pull request on the task's branch: no verdict, with the reason", async () => {
      const { deps } = gateDeps({ snapshot: snapshot([openPull(41, "ada/rocket-fuel")]) });
      expect(await gateReport(monitorWake, deps)).toEqual({
        task: "HAL-41",
        verdict: undefined,
        reason: "HAL-41 has no pull request on an <agent>/HAL-41-<words> branch",
      });
    });

    test("a failed GitHub read: no verdict, and it doesn't throw", async () => {
      const { deps } = gateDeps({
        snapshot: snapshot([openPull(41, "ada/HAL-41-fuel")], minutesAgo(7)),
        githubFails: true,
      });
      expect(await gateReport(monitorWake, deps)).toEqual({
        task: undefined,
        verdict: undefined,
        reason: "couldn't decide: GitHub answered 502",
      });
    });

    test("with the setting off, or on another wake, the gate doesn't look", async () => {
      expect(await gateReport(monitorWake, gateDeps({ mode: "off" }).deps)).toBeUndefined();
      const assigned = { ...monitorWake, wakeReason: "issue_assigned" };
      expect(await gateReport(assigned, gateDeps({}).deps)).toBeUndefined();
    });
  });
});
