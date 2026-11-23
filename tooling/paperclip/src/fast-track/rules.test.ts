import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { checksOf } from "../snapshot/read.ts";
import type { SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";
import {
  ago,
  boardLogin,
  entry,
  liamApproved,
  merged,
  now,
  pull,
  repo,
} from "./fast-track.test-helper.ts";
import { fastTrackRules, type Tracked } from "./rules.ts";

const seen: Tracked = { labelledAt: ago(60), readySince: null, queuedAt: null };

function run(
  snapshot: SnapshotRepo,
  tracked: ReadonlyMap<number, Tracked> = new Map(
    snapshot.pulls.map((each) => [each.number, seen] as const),
  ),
  unblocks: ReadonlySet<number> = new Set(),
  labelAdder = boardLogin,
) {
  return fastTrackRules({ repo: snapshot, now, tracked, unblocks, labelAdder });
}

function stages(snapshot: SnapshotRepo, tracked?: ReadonlyMap<number, Tracked>): string[] {
  return run(snapshot, tracked).events.map((event) => event.key);
}

function labelBy(addedBy: string | null): Partial<NonNullable<SnapshotPull["open"]>> {
  return { labels: [{ name: "fast-track", addedBy, addedAt: ago(60) }] };
}

verifies("paperclip.fast-track-rules", () => {
  test("reports a pull request the first time it carries the label, and only then", () => {
    const snapshot = repo([pull(101, liamApproved, { base: "liam/HAL-1-base" })]);
    expect(stages(snapshot, new Map())).toEqual(["acme/tools#101 new"]);
    expect(stages(snapshot)).toEqual([]);
  });

  test("flags a label nobody allowed: halonic-dev, an unknown adder, a bot's pull request", () => {
    const keys = stages(
      repo([
        pull(102, { ...liamApproved, ...labelBy("halonic-dev") }, { base: "x" }),
        pull(103, { ...liamApproved, ...labelBy(null) }, { base: "x" }),
        pull(104, { ...liamApproved, author: "dependabot[bot]" }, { base: "x" }),
      ]),
    );
    expect(keys).toEqual([
      "acme/tools#102 wrong_label:halonic-dev",
      "acme/tools#103 wrong_label:unknown",
      "acme/tools#104 bot_label",
    ]);
  });

  test("counts no label while the board's login isn't set", () => {
    const events = run(
      repo([pull(120, liamApproved, { base: "x" })]),
      undefined,
      new Set(),
      "",
    ).events;
    expect(events.map((event) => event.key)).toEqual(["acme/tools#120 wrong_label:board-member"]);
    expect(events[0]?.text).toMatch(/^the board's login isn't set/);
  });

  test("asks the reviewer 30 minutes after the label, Julian for Liam's own pull request", () => {
    const events = run(
      repo([
        pull(105),
        pull(106, {}, { branch: "liam/HAL-106-x" }),
        pull(107, labelBy(boardLogin), {}),
      ]),
    ).events;
    expect(events.map((event) => event.key)).toContain("acme/tools#105 review_nudge:abc1234def56");
    expect(events.find((event) => event.number === 106)?.text).toMatch(/^Julian, please review/);
    const fresh = run(
      repo([
        pull(108, {
          labels: [{ name: "fast-track", addedBy: boardLogin, addedAt: ago(10) }],
        }),
      ]),
    );
    expect(fresh.events).toEqual([]);
  });

  test("names each failing check once per head, but not a decision note before approval", () => {
    const failing = {
      failingChecks: [
        "Decision note and the guard's own paths",
        "Requirements and the requirement guard (merge base's copy)",
        "ci-ok",
      ],
      ciOk: "failure" as const,
    };
    expect(stages(repo([pull(109, failing)])).filter((key) => key.includes("check_fail"))).toEqual(
      [],
    );
    const lint = {
      failingChecks: ["Lint", "ci-ok", "Live cloud suites passed"],
      ciOk: "failure" as const,
    };
    expect(stages(repo([pull(110, { ...liamApproved, ...lint })]))).toEqual([
      "acme/tools#110 check_fail:Lint:abc1234def56",
      "acme/tools#110 check_fail:ci-ok:abc1234def56",
    ]);
    const stillRunning = {
      failingChecks: ["ci-ok"],
      ciOk: "failure" as const,
      pendingChecks: ["Build"],
    };
    expect(stages(repo([pull(111, { ...liamApproved, ...stillRunning })]))).toEqual([]);
    expect(stages(repo([pull(112, { ...liamApproved, ...lint, draft: true })]))).toEqual([]);
  });

  test("asks the Merger once it has been approved and green for 10 minutes, with a jump only past 8 ahead", () => {
    const ready = pull(113, liamApproved);
    const first = run(repo([ready]));
    expect(first.events).toEqual([]);
    const since = first.tracked.get(113) as Tracked;
    expect(since.readySince).toEqual({ head: ready.head, at: now.toISOString() });
    const later = new Map([[113, { ...since, readySince: { head: ready.head, at: ago(11) } }]]);
    const queue = Array.from({ length: 9 }, (_, index) => entry(900 + index, index + 1));
    const ask = (snapshot: SnapshotRepo, unblocks = new Set<number>()) =>
      run(snapshot, later, unblocks).events.find((event) => event.stage === "enqueue_ask")?.text;
    expect(ask(repo([ready]))).toMatch(/without a jump \(0 in the queue\)/);
    expect(ask(repo([ready]), new Set([113]))).toMatch(/with a jump: it unblocks/);
    expect(ask(repo([ready], queue))).toMatch(/with a jump: 9 pull requests are ahead/);
  });

  test("asks the Merger and the reviewer next to skipped path-filtered checks", () => {
    const run_ = (name: string, conclusion: string) => ({
      name,
      status: "COMPLETED",
      conclusion,
      startedAt: conclusion === "SKIPPED" ? null : ago(40),
    });
    const rollup = {
      contexts: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          run_("Windows build", "SKIPPED"),
          run_("Docs site", "SKIPPED"),
          run_("Lint", "SUCCESS"),
          run_("ci-ok", "SUCCESS"),
        ],
      },
    };
    const ready = pull(118, { ...liamApproved, ...checksOf(rollup) });
    const later = new Map([[118, { ...seen, readySince: { head: ready.head, at: ago(11) } }]]);
    expect(run(repo([ready]), later).events.map((event) => event.stage)).toEqual(["enqueue_ask"]);
    const unreviewed = pull(119, checksOf(rollup));
    expect(stages(repo([unreviewed]))).toEqual(["acme/tools#119 review_nudge:abc1234def56"]);
  });

  test("doesn't ask while another fast-track pull request is queued, or for a stacked one", () => {
    const ready = pull(114, liamApproved);
    const later = new Map([[114, { ...seen, readySince: { head: ready.head, at: ago(20) } }]]);
    const other = pull(115, { ...liamApproved, inQueue: true });
    const snapshot = repo([ready, other], [entry(115, 1)]);
    expect(
      run(snapshot, new Map([...later, [115, seen]])).events.map((e) => e.stage),
    ).not.toContain("enqueue_ask");
    expect(run(repo([{ ...ready, base: "mateo/HAL-1-base" }]), later).events).toEqual([]);
  });

  test("restarts the 10 minutes when the head changes", () => {
    const ready = pull(116, liamApproved);
    const old = new Map([[116, { ...seen, readySince: { head: "0ld", at: ago(30) } }]]);
    expect(run(repo([ready]), old).tracked.get(116)?.readySince?.at).toBe(now.toISOString());
  });

  test("follows it through the queue: slow, failing group, removed, merged", () => {
    const queued = pull(117, { ...liamApproved, inQueue: true });
    const slow = entry(117, 1, { enqueuedAt: ago(31), groupCiOk: "failure" });
    expect(stages(repo([queued], [slow]))).toEqual([
      `acme/tools#117 queue_slow:${ago(31)}`,
      `acme/tools#117 group_fail:${ago(31)}`,
    ]);
    const wasQueued = new Map([[117, { ...seen, queuedAt: ago(31) }]]);
    expect(stages(repo([pull(117, liamApproved, { base: "x" })]), wasQueued)).toEqual([
      `acme/tools#117 group_fail:removed:${ago(31)}`,
    ]);
    const done = run(repo([merged(117, 1)]), wasQueued);
    expect(done.events.map((event) => [event.key, event.text])).toEqual([
      ["acme/tools#117 merged", "merged 59 min after the label."],
    ]);
    expect(done.tracked.size).toBe(0);
  });
});
