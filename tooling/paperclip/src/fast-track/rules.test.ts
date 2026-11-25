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
import type { SharedLabelScope } from "./scope.ts";

const seen: Tracked = { labelledAt: ago(60), readySince: null, queuedAt: null };

/** `halonic-dev`'s scope in these tests: #5659, and HAL-501, a child of a listed task. */
const sharedScope: SharedLabelScope = {
  pulls: new Set(["acme/tools#5659"]),
  tasks: new Set(["HAL-501"]),
};

function run(
  snapshot: SnapshotRepo,
  tracked: ReadonlyMap<number, Tracked> = new Map(
    snapshot.pulls.map((each) => [each.number, seen] as const),
  ),
  unblocks: ReadonlySet<number> = new Set(),
  labelAdder = boardLogin,
) {
  return fastTrackRules({ repo: snapshot, now, tracked, unblocks, labelAdder, sharedScope });
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

  test("flags a label nobody allowed: someone else, an unknown adder, a bot's pull request", () => {
    const keys = stages(
      repo([
        pull(102, { ...liamApproved, ...labelBy("stranger") }, { base: "x" }),
        pull(103, { ...liamApproved, ...labelBy(null) }, { base: "x" }),
        pull(104, { ...liamApproved, author: "dependabot[bot]" }, { base: "x" }),
      ]),
    );
    expect(keys).toEqual([
      "acme/tools#102 wrong_label:stranger",
      "acme/tools#103 wrong_label:unknown",
      "acme/tools#104 bot_label",
    ]);
  });

  test("counts a label added as halonic-dev on a listed task's child, with or without the board's login set", () => {
    const shared = pull(
      121,
      { ...liamApproved, ...labelBy("halonic-dev") },
      { base: "x", branch: "mateo/HAL-501-apps" },
    );
    expect(stages(repo([shared]))).toEqual([]);
    expect(run(repo([shared]), undefined, new Set(), "").events).toEqual([]);
  });

  test("counts a label added as halonic-dev on a listed pull request", () => {
    const listed = pull(5659, { ...liamApproved, ...labelBy("halonic-dev") }, { base: "x" });
    expect(stages(repo([listed]))).toEqual([]);
  });

  test("flags a label added as halonic-dev on any other pull request", () => {
    const other = pull(123, { ...liamApproved, ...labelBy("halonic-dev") }, { base: "x" });
    const fork = pull(
      124,
      { ...liamApproved, ...labelBy("halonic-dev") },
      { base: "x", branch: "mateo/HAL-501-apps", headRepo: "someone/tools" },
    );
    const events = run(repo([other, fork])).events;
    expect(events.map((event) => event.key)).toEqual([
      "acme/tools#123 wrong_label:halonic-dev",
      "acme/tools#124 wrong_label:halonic-dev",
    ]);
    expect(events[0]?.text).toMatch(
      /counts only on the pull requests in fastTrackSharedLabelScope/,
    );
  });

  test("counts the board's login on any pull request", () => {
    const board = pull(125, liamApproved, { base: "x", branch: "mateo/HAL-999-other" });
    expect(stages(repo([board]))).toEqual([]);
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

  test("asks the reviewer on the task as soon as it is ready, Julian for Liam's own pull request", () => {
    const events = run(repo([pull(105), pull(106, {}, { branch: "liam/HAL-106-x" })])).events;
    expect(events.map((event) => [event.key, event.to])).toEqual([
      ["acme/tools#105 review_nudge:abc1234def56", ["task"]],
      ["acme/tools#106 review_nudge:abc1234def56", ["task"]],
    ]);
    expect(events[1]?.text).toMatch(/^Julian, please review/);
    const running = pull(108, { pendingChecks: ["Build"] });
    expect(stages(repo([running]))).toEqual([]);
    expect(stages(repo([pull(109, { draft: true })]))).toEqual([]);
  });

  test("tells the board 15 minutes after it was ready if still not approved on the same head", () => {
    const ready = pull(122);
    const first = run(repo([ready]));
    expect(first.events.map((event) => event.stage)).toEqual(["review_nudge"]);
    expect(first.tracked.get(122)?.reviewSince).toEqual({
      head: ready.head,
      at: now.toISOString(),
    });
    const later = (minutes: number, head = ready.head) =>
      new Map([[122, { ...seen, reviewSince: { head, at: ago(minutes) } }]]);
    expect(run(repo([ready]), later(14)).events.map((event) => event.stage)).toEqual([
      "review_nudge",
    ]);
    const escalated = run(repo([ready]), later(15)).events;
    expect(escalated.map((event) => [event.key, event.to])).toEqual([
      ["acme/tools#122 review_nudge:abc1234def56", ["task"]],
      ["acme/tools#122 review_escalate:abc1234def56", ["board"]],
    ]);
    expect(run(repo([ready]), later(20, "0ld")).events.map((event) => event.stage)).toEqual([
      "review_nudge",
    ]);
    expect(run(repo([pull(122, liamApproved)]), later(20)).events).toEqual([]);
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

  test("asks without a jump while another fast-track pull request is queued, and not for a stacked one", () => {
    const ready = pull(114, liamApproved);
    const later = new Map([[114, { ...seen, readySince: { head: ready.head, at: ago(20) } }]]);
    const other = pull(115, { ...liamApproved, inQueue: true });
    const queue = [entry(115, 1), ...Array.from({ length: 9 }, (_, i) => entry(900 + i, i + 2))];
    const tracked = new Map([...later, [115, seen]]);
    const asks = (snapshot: SnapshotRepo, unblocks = new Set<number>()) =>
      run(snapshot, tracked, unblocks).events.filter((event) => event.stage === "enqueue_ask");
    for (const snapshot of [repo([ready, other], [entry(115, 1)]), repo([ready, other], queue)]) {
      const [ask] = asks(snapshot);
      expect(ask?.key).toBe("acme/tools#114 enqueue_ask:abc1234def56");
      expect(ask?.text).toMatch(
        /queue it normally, without a jump: fast-track #115 is already queued/,
      );
    }
    expect(asks(repo([ready, other], queue), new Set([114]))[0]?.text).toMatch(/without a jump/);
    expect(run(repo([{ ...ready, base: "mateo/HAL-1-base" }]), later).events).toEqual([]);
  });

  test("names a jump only with 9 or more ahead and no fast-track pull request queued", () => {
    const ready = pull(123, liamApproved);
    const later = new Map([[123, { ...seen, readySince: { head: ready.head, at: ago(11) } }]]);
    const queueOf = (length: number) => Array.from({ length }, (_, i) => entry(900 + i, i + 1));
    const ask = (length: number) =>
      run(repo([ready], queueOf(length)), later).events.find((e) => e.stage === "enqueue_ask")
        ?.text;
    expect(ask(8)).toMatch(/without a jump \(8 in the queue\)/);
    expect(ask(9)).toMatch(/with a jump: 9 pull requests are ahead/);
  });

  test("jumps for a label added as halonic-dev only within its scope, for the board's anywhere", () => {
    const queue = Array.from({ length: 9 }, (_, i) => entry(900 + i, i + 1));
    const ask = (number: number, by: string, branch = `mateo/HAL-${number}-thing`) => {
      const ready = pull(number, { ...liamApproved, ...labelBy(by) }, { branch });
      const later = new Map([[number, { ...seen, readySince: { head: ready.head, at: ago(11) } }]]);
      return run(repo([ready], queue), later).events.find((e) => e.stage === "enqueue_ask")?.text;
    };
    expect(ask(126, "halonic-dev", "mateo/HAL-501-apps")).toMatch(/with a jump: 9 pull requests/);
    expect(ask(5659, "halonic-dev")).toMatch(/with a jump: 9 pull requests/);
    expect(ask(127, "halonic-dev")).toMatch(/without a jump \(9 in the queue\)/);
    expect(ask(128, boardLogin)).toMatch(/with a jump: 9 pull requests/);
  });

  test("restarts the 10 minutes when the head changes", () => {
    const ready = pull(116, liamApproved);
    const old = new Map([[116, { ...seen, readySince: { head: "0ld", at: ago(30) } }]]);
    expect(run(repo([ready]), old).tracked.get(116)?.readySince?.at).toBe(now.toISOString());
  });

  test("calls it slow only after 30 minutes first in the queue, not while it waits behind others", () => {
    const queued = pull(124, { ...liamApproved, inQueue: true });
    const behind = entry(124, 3, { enqueuedAt: ago(45) });
    const wasBehind = new Map([[124, { ...seen, queuedAt: ago(45) }]]);
    const third = run(repo([queued], [behind]), wasBehind);
    expect(third.events).toEqual([]);
    expect(third.tracked.get(124)?.firstInQueueSince).toBeNull();
    const front = entry(124, 1, { enqueuedAt: ago(45) });
    expect(run(repo([queued], [front]), wasBehind).tracked.get(124)?.firstInQueueSince).toBe(
      now.toISOString(),
    );
    const firstFor = (minutes: number) =>
      new Map([[124, { ...seen, queuedAt: ago(45), firstInQueueSince: ago(minutes) }]]);
    expect(stages(repo([queued], [front]), firstFor(29))).toEqual([]);
    expect(stages(repo([queued], [front]), firstFor(31))).toEqual([
      `acme/tools#124 queue_slow:${ago(45)}`,
    ]);
  });

  test("follows it through the queue: slow, failing group, removed, merged", () => {
    const queued = pull(117, { ...liamApproved, inQueue: true });
    const slow = entry(117, 1, { enqueuedAt: ago(31), groupCiOk: "failure" });
    const firstSince = new Map([[117, { ...seen, queuedAt: ago(31), firstInQueueSince: ago(31) }]]);
    expect(stages(repo([queued], [slow]), firstSince)).toEqual([
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
