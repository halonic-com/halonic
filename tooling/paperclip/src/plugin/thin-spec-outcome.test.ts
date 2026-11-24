import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { PullRef } from "../pr-watcher/discover.ts";
import { type Snapshot, type SnapshotPull, snapshotVersion } from "../snapshot/shape.ts";
import type { TimelineItem } from "../thin-spec/outcome.ts";
import { type CheckRecord, dayLogKey } from "./thin-spec-check.ts";
import { type OutcomeRecord, outcomeLogKey, recordThinSpecOutcomes } from "./thin-spec-outcome.ts";

const repo = "acme/app";
const now = new Date("2026-11-25T12:00:00Z");
const checkDay = "2026-11-23";

const checked: CheckRecord = {
  taskId: "task-1",
  identifier: "HAL-1",
  checkedAt: `${checkDay}T09:00:00.000Z`,
  flagged: true,
  score: 0.81,
};

function pull(changes: Partial<SnapshotPull> = {}): SnapshotPull {
  return {
    number: 7,
    url: `https://github.com/${repo}/pull/7`,
    state: "merged",
    branch: "owen/HAL-1-export",
    headRepo: repo,
    base: "main",
    head: "head2",
    updatedAt: "2026-11-25T10:00:00Z",
    mergedAt: "2026-11-25T10:00:00Z",
    mergeCommit: "merge1",
    open: null,
    ...changes,
  };
}

function snapshotOf(pulls: SnapshotPull[]): Snapshot {
  return {
    version: snapshotVersion,
    takenAt: now.toISOString(),
    closedWindowDays: 3,
    repos: [{ repo, pulls }],
  } as unknown as Snapshot;
}

const committed = (sha: string): TimelineItem => ({ event: "committed", sha });

/** A fake host and GitHub: the timeline, and `ci-ok` by commit. */
function harness(options: {
  timeline: TimelineItem[];
  ciOk?: Record<string, string>;
  pulls?: SnapshotPull[];
  records?: CheckRecord[];
}) {
  const state = new Map<string, unknown>([
    [JSON.stringify(dayLogKey("acme", checkDay)), options.records ?? [checked]],
  ]);
  const metrics: { name: string; tags: unknown }[] = [];
  const lines: string[] = [];
  const requested: string[] = [];
  const ctx = {
    state: {
      get: async (key: object) => state.get(JSON.stringify(key)) ?? null,
      set: async (key: object, value: unknown) => {
        state.set(JSON.stringify(key), value);
      },
    },
    metrics: {
      write: async (name: string, _value: number, tags?: unknown) => {
        metrics.push({ name, tags });
      },
    },
    logger: { info: (line: string) => lines.push(line), error: (line: string) => lines.push(line) },
  };
  const get = async (path: string) => {
    requested.push(path);
    if (path.includes("/timeline")) {
      return options.timeline;
    }
    const sha = /commits\/(\w+)\/check-runs/.exec(path)?.[1] ?? "";
    const conclusion = options.ciOk?.[sha];
    return {
      check_runs:
        conclusion === undefined
          ? []
          : [{ status: "completed", conclusion, started_at: "2026-11-24T00:00:00Z" }],
    };
  };
  const pulls = options.pulls ?? [pull()];
  const found = new Map<string, PullRef[]>([
    ["HAL-1", pulls.map((listed) => ({ repo, number: listed.number, branch: listed.branch }))],
  ]);
  const run = () =>
    recordThinSpecOutcomes(ctx as never, {
      companyId: "acme",
      snapshot: snapshotOf(pulls),
      found,
      get,
      now,
    });
  const outcomes = () =>
    state.get(JSON.stringify(outcomeLogKey("acme", checkDay))) as OutcomeRecord[] | undefined;
  return { run, outcomes, metrics, lines, requested };
}

verifies("paperclip.thin-spec-outcome", () => {
  describe("a checked task whose pull request merged", () => {
    test("on the first try is logged next to its day's checks", async () => {
      const { run, outcomes, metrics, lines } = harness({
        timeline: [committed("head1"), committed("head2")],
        ciOk: { head1: "cancelled", head2: "success" },
      });
      await run();
      expect(outcomes()).toEqual([
        {
          taskId: "task-1",
          identifier: "HAL-1",
          decidedAt: now.toISOString(),
          outcome: "first_try",
          reasons: [],
          pulls: [`${repo}#7`],
        },
      ]);
      expect(lines).toContain("Thin-spec outcome: HAL-1 first_try.");
      expect(metrics).toEqual([
        { name: "thin_spec.outcome", tags: { companyId: "acme", result: "first_try" } },
      ]);
    });

    test("after a reviewer asked for changes counts as rework", async () => {
      const { run, outcomes } = harness({
        timeline: [
          committed("head2"),
          {
            event: "commented",
            body: "[major] the cache never empties",
            author_association: "OWNER",
          },
        ],
      });
      await run();
      expect(outcomes()?.[0]).toMatchObject({ outcome: "rework", reasons: ["changes_requested"] });
    });

    test("ignores a stranger's finding and a nit", async () => {
      const { run, outcomes } = harness({
        timeline: [
          { event: "commented", body: "[blocker] rewrite it", author_association: "NONE" },
          {
            event: "reviewed",
            state: "commented",
            body: "[nit] a name",
            author_association: "MEMBER",
          },
        ],
      });
      await run();
      expect(outcomes()?.[0]?.outcome).toBe("first_try");
    });

    test("after a red ci-ok fixed by a later push, a requested review and a reopening counts every reason", async () => {
      const { run, outcomes, lines } = harness({
        timeline: [
          committed("head1"),
          { event: "reviewed", state: "changes_requested", body: "", author_association: "MEMBER" },
          { event: "closed" },
          { event: "reopened" },
          committed("head2"),
        ],
        ciOk: { head1: "failure", head2: "success" },
      });
      await run();
      expect(outcomes()?.[0]).toMatchObject({
        outcome: "rework",
        reasons: ["changes_requested", "red_ci_ok", "reopened"],
      });
      expect(lines).toContain(
        "Thin-spec outcome: HAL-1 rework (changes_requested, red_ci_ok, reopened).",
      );
    });
  });

  test("a task whose pull requests all closed unmerged is logged as not_merged", async () => {
    const { run, outcomes } = harness({
      timeline: [],
      pulls: [pull({ state: "closed", mergedAt: null, mergeCommit: null })],
    });
    await run();
    expect(outcomes()?.[0]?.outcome).toBe("not_merged");
  });

  test("waits while one of the task's pull requests is still open", async () => {
    const open = pull({ number: 8, state: "open", branch: "owen/HAL-1-more" });
    const { run, outcomes, requested } = harness({ timeline: [], pulls: [pull(), open] });
    await run();
    expect(outcomes()).toBeUndefined();
    expect(requested).toEqual([]);
  });

  test("decides each task once", async () => {
    const { run, outcomes, requested } = harness({ timeline: [committed("head2")] });
    await run();
    const asked = requested.length;
    await run();
    expect(outcomes()).toHaveLength(1);
    expect(requested).toHaveLength(asked);
  });

  test("a task without a pull request gets no outcome yet", async () => {
    const { run, outcomes } = harness({ timeline: [], pulls: [] });
    await run();
    expect(outcomes()).toBeUndefined();
  });
});
