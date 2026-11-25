import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  ago,
  boardLogin,
  entry,
  liamApproved,
  merged,
  now,
  pull,
  repo,
} from "../fast-track/fast-track.test-helper.ts";
import { emptyState, type FastTrackState, fastTrackPass } from "../fast-track/pass.ts";
import type { Tracked } from "../fast-track/rules.ts";
import {
  defaultSharedLabelList,
  type SharedLabelList,
  type SharedLabelScope,
  sharedLabelScope,
} from "../fast-track/scope.ts";
import { checksOf } from "../snapshot/read.ts";
import type { Snapshot, SnapshotPull, SnapshotRepo } from "../snapshot/shape.ts";
import { decide, type FastTrackSettings } from "./rules/fast-track.ts";
import { checkPulls } from "./rules/fast-track-checks.ts";

/**
 * The inputs of `fast-track/rules.test.ts`, `pass.test.ts` and
 * `scope.test.ts`, replayed through the `fast-track` signal rule (HAL-18320):
 * for each, the rule's notices and what it remembers equal today's
 * `fastTrackPass`. The queue-wait log, the third step, has its own parity
 * test in `fast-track-jumps.test.ts` (HAL-18973).
 */

const defaults: FastTrackSettings = {
  reviewEscalateMinutes: 15,
  enqueueAfterMinutes: 10,
  queueSlowMinutes: 30,
  jumpAhead: 8,
};

/** `halonic-dev`'s scope in `rules.test.ts`: #5659, and HAL-501, a child of a listed task. */
const rulesScope: SharedLabelScope = {
  pulls: new Set(["acme/tools#5659"]),
  tasks: new Set(["HAL-501"]),
};

interface PassSettings {
  readonly unblocks: ReadonlySet<number>;
  readonly labelAdder: string;
  readonly sharedScope: SharedLabelScope;
}

const passSettings = (changes: Partial<PassSettings> = {}): PassSettings => ({
  unblocks: new Set(),
  labelAdder: boardLogin,
  sharedScope: rulesScope,
  ...changes,
});

function snapshotOf(...repos: SnapshotRepo[]): Snapshot {
  return { version: 1, takenAt: now.toISOString(), closedWindowDays: 3, repos };
}

/** A state remembering these pull requests of `acme/tools`, as `rules.test.ts` gives them. */
function stateOf(tracked: readonly (readonly [number, Tracked])[]): FastTrackState {
  const entries = tracked.map(([number, value]) => [`acme/tools#${number}`, value] as const);
  return { ...emptyState, tracked: Object.fromEntries(entries) };
}

/** Today's pass, as the rule's actions put together. */
function today(snapshot: Snapshot, before: FastTrackState, settings: PassSettings) {
  const pass = fastTrackPass(snapshot, before, settings, now);
  return {
    notices: pass.events.map((event) => ({ kind: "notice", ...event, task: event.task ?? null })),
    tracked: pass.state.tracked,
  };
}

/** The rule's pass, every input through JSON as a ToolScript Action gets it. */
function rule(
  snapshot: Snapshot,
  before: FastTrackState,
  settings: PassSettings,
  ruleSettings = defaults,
) {
  const json = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value));
  const notices: unknown[] = [];
  const tracked: Record<string, unknown> = {};
  for (const each of snapshot.repos) {
    const prefix = `${each.repo}#`;
    const base = json({
      repo: each,
      labelAdder: settings.labelAdder,
      sharedScope: {
        pulls: [...settings.sharedScope.pulls],
        tasks: [...settings.sharedScope.tasks],
      },
    });
    const was = Object.entries(before.tracked).filter(([key]) => key.startsWith(prefix));
    const input = json({
      ...base,
      now: now.toISOString(),
      settings: ruleSettings,
      checks: checkPulls(base),
      tracked: Object.fromEntries(was.map(([key, value]) => [key.slice(prefix.length), value])),
      reported: Object.keys(before.fired),
      unblocks: [...settings.unblocks],
    });
    for (const action of decide(input)) {
      if (action.kind === "notice") {
        notices.push(action);
      } else {
        for (const [number, value] of Object.entries(action.tracked)) {
          tracked[`${prefix}${number}`] = value;
        }
      }
    }
  }
  return { notices, tracked };
}

function expectParity(snapshot: Snapshot, before: FastTrackState, settings: PassSettings) {
  const expected = today(snapshot, before, settings);
  expect(rule(snapshot, before, settings)).toEqual(expected);
  return expected;
}

const seen: Tracked = { labelledAt: ago(60), readySince: null, queuedAt: null };
const labelBy = (addedBy: string | null) => ({
  labels: [{ name: "fast-track", addedBy, addedAt: ago(60) }],
});
const queueOf = (length: number, from = 1) =>
  Array.from({ length }, (_, index) => entry(900 + index, index + from));
const ready = (number: number, minutes: number, head = pull(number).head): [number, Tracked] => [
  number,
  { ...seen, readySince: { head, at: ago(minutes) } },
];
const reviewing = (minutes: number, head = pull(122).head): [number, Tracked] => [
  122,
  { ...seen, reviewSince: { head, at: ago(minutes) } },
];
const skipped = checksOf({
  contexts: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [
      { name: "Windows build", status: "COMPLETED", conclusion: "SKIPPED", startedAt: null },
      { name: "Lint", status: "COMPLETED", conclusion: "SUCCESS", startedAt: ago(40) },
      { name: "ci-ok", status: "COMPLETED", conclusion: "SUCCESS", startedAt: ago(40) },
    ],
  },
});
const lint = {
  failingChecks: ["Lint", "ci-ok", "Live cloud suites passed"],
  ciOk: "failure" as const,
};
const note = {
  failingChecks: [
    "Decision note and the guard's own paths",
    "Requirements and the requirement guard (merge base's copy)",
    "ci-ok",
  ],
  ciOk: "failure" as const,
};
const queued = (number: number) => pull(number, { ...liamApproved, inQueue: true });

/** Each `rules.test.ts` input: the pull requests, the queue, what was remembered (every pull seen by default), and settings. */
const rulesInputs: [
  string,
  SnapshotPull[],
  ReturnType<typeof entry>[],
  [number, Tracked][] | undefined,
  Partial<PassSettings>,
][] = [
  ["a new label", [pull(101, liamApproved, { base: "liam/HAL-1-base" })], [], [], {}],
  [
    "a label seen before",
    [pull(101, liamApproved, { base: "liam/HAL-1-base" })],
    [],
    undefined,
    {},
  ],
  [
    "labels nobody allowed",
    [
      pull(102, { ...liamApproved, ...labelBy("stranger") }, { base: "x" }),
      pull(103, { ...liamApproved, ...labelBy(null) }, { base: "x" }),
      pull(104, { ...liamApproved, author: "dependabot[bot]" }, { base: "x" }),
    ],
    [],
    undefined,
    {},
  ],
  ...(["board-member", ""] as const).map((labelAdder): (typeof rulesInputs)[number] => [
    `halonic-dev on a listed task's child, board login "${labelAdder}"`,
    [
      pull(
        121,
        { ...liamApproved, ...labelBy("halonic-dev") },
        { base: "x", branch: "mateo/HAL-501-apps" },
      ),
    ],
    [],
    undefined,
    { labelAdder },
  ]),
  [
    "halonic-dev on a listed pull request",
    [pull(5659, { ...liamApproved, ...labelBy("halonic-dev") }, { base: "x" })],
    [],
    undefined,
    {},
  ],
  [
    "halonic-dev elsewhere and on a fork",
    [
      pull(123, { ...liamApproved, ...labelBy("halonic-dev") }, { base: "x" }),
      pull(
        124,
        { ...liamApproved, ...labelBy("halonic-dev") },
        { base: "x", branch: "mateo/HAL-501-apps", headRepo: "someone/tools" },
      ),
    ],
    [],
    undefined,
    {},
  ],
  [
    "the board's login anywhere",
    [pull(125, liamApproved, { base: "x", branch: "mateo/HAL-999-other" })],
    [],
    undefined,
    {},
  ],
  [
    "no board login set",
    [pull(120, liamApproved, { base: "x" })],
    [],
    undefined,
    { labelAdder: "" },
  ],
  [
    "ready, and Liam's own",
    [pull(105), pull(106, {}, { branch: "liam/HAL-106-x" })],
    [],
    undefined,
    {},
  ],
  [
    "a check still running, a draft",
    [pull(108, { pendingChecks: ["Build"] }), pull(109, { draft: true })],
    [],
    undefined,
    {},
  ],
  ["ready for review now", [pull(122)], [], undefined, {}],
  ["ready 14 minutes", [pull(122)], [], [reviewing(14)], {}],
  ["ready 15 minutes", [pull(122)], [], [reviewing(15)], {}],
  ["ready on another head", [pull(122)], [], [reviewing(20, "0ld")], {}],
  ["approved after waiting", [pull(122, liamApproved)], [], [reviewing(20)], {}],
  [
    "failing checks",
    [
      pull(109, note),
      pull(110, { ...liamApproved, ...lint }),
      pull(111, {
        ...liamApproved,
        failingChecks: ["ci-ok"],
        ciOk: "failure",
        pendingChecks: ["Build"],
      }),
      pull(112, { ...liamApproved, ...lint, draft: true }),
    ],
    [],
    undefined,
    {},
  ],
  ["approved and green now", [pull(113, liamApproved)], [], undefined, {}],
  ["green 11 minutes, empty queue", [pull(113, liamApproved)], [], [ready(113, 11)], {}],
  [
    "green 11 minutes, unblocks",
    [pull(113, liamApproved)],
    [],
    [ready(113, 11)],
    { unblocks: new Set([113]) },
  ],
  ["green 11 minutes, 9 ahead", [pull(113, liamApproved)], queueOf(9), [ready(113, 11)], {}],
  ["8 ahead", [pull(123, liamApproved)], queueOf(8), [ready(123, 11)], {}],
  [
    "skipped path-filtered checks",
    [pull(118, { ...liamApproved, ...skipped }), pull(119, skipped)],
    [],
    [ready(118, 11), [119, seen]],
    {},
  ],
  [
    "another fast-track queued",
    [pull(114, liamApproved), queued(115)],
    [entry(115, 1)],
    [ready(114, 20), [115, seen]],
    {},
  ],
  [
    "another fast-track queued, 9 behind it",
    [pull(114, liamApproved), queued(115)],
    [entry(115, 1), ...queueOf(9, 2)],
    [ready(114, 20), [115, seen]],
    { unblocks: new Set([114]) },
  ],
  ["stacked", [pull(114, liamApproved, { base: "mateo/HAL-1-base" })], [], [ready(114, 20)], {}],
  ...(
    [
      [126, "halonic-dev", "mateo/HAL-501-apps"],
      [5659, "halonic-dev", "mateo/HAL-5659-thing"],
      [127, "halonic-dev", "mateo/HAL-127-thing"],
      [128, boardLogin, "mateo/HAL-128-thing"],
    ] as const
  ).map(([number, by, branch]): (typeof rulesInputs)[number] => [
    `a jump for #${number}, labelled by ${by}`,
    [pull(number, { ...liamApproved, ...labelBy(by) }, { branch })],
    queueOf(9),
    [ready(number, 11)],
    {},
  ]),
  ["a new head", [pull(116, liamApproved)], [], [ready(116, 30, "0ld")], {}],
  [
    "third in the queue",
    [queued(124)],
    [entry(124, 3, { enqueuedAt: ago(45) })],
    [[124, { ...seen, queuedAt: ago(45) }]],
    {},
  ],
  [
    "first in the queue now",
    [queued(124)],
    [entry(124, 1, { enqueuedAt: ago(45) })],
    [[124, { ...seen, queuedAt: ago(45) }]],
    {},
  ],
  ...[29, 31].map((minutes): (typeof rulesInputs)[number] => [
    `first in the queue ${minutes} minutes`,
    [queued(124)],
    [entry(124, 1, { enqueuedAt: ago(45) })],
    [[124, { ...seen, queuedAt: ago(45), firstInQueueSince: ago(minutes) }]],
    {},
  ]),
  [
    "slow with a failing group",
    [queued(117)],
    [entry(117, 1, { enqueuedAt: ago(31), groupCiOk: "failure" })],
    [[117, { ...seen, queuedAt: ago(31), firstInQueueSince: ago(31) }]],
    {},
  ],
  [
    "out of the queue",
    [pull(117, liamApproved, { base: "x" })],
    [],
    [[117, { ...seen, queuedAt: ago(31) }]],
    {},
  ],
  ["merged", [merged(117, 1)], [], [[117, { ...seen, queuedAt: ago(31) }]], {}],
];

/** `scope.test.ts`'s tasks: HAL-501 and HAL-502 are children of HAL-17422, HAL-503 of HAL-9. */
const parentIds: Record<string, string | null> = {
  "HAL-17422": null,
  "HAL-9": null,
  "HAL-501": "id-HAL-17422",
  "HAL-502": "id-HAL-17422",
  "HAL-503": "id-HAL-9",
};

const issues = {
  async get(task: string) {
    return task in parentIds ? ({ id: `id-${task}`, parentId: parentIds[task] } as never) : null;
  },
};

const scopePulls = (
  [
    [1, "halonic-dev", "mateo/HAL-501-apps"],
    [2, "halonic-dev", "mateo/HAL-503-other"],
    [3, "board-member", "mateo/HAL-502-apps"],
    [4, "halonic-dev", "no-task-branch"],
  ] as const
).map(([number, by, branch]) => pull(number, { ...liamApproved, ...labelBy(by) }, { branch }));

verifies("paperclip.signal-fast-track", () => {
  test.each(rulesInputs)("gives today's actions for %s", (_, pulls, queue, tracked, changes) => {
    const remembered = tracked ?? pulls.map((each) => [each.number, seen] as [number, Tracked]);
    expectParity(snapshotOf(repo(pulls, queue)), stateOf(remembered), passSettings(changes));
  });

  test.each<[string, SharedLabelList]>([
    ["the board's list", defaultSharedLabelList],
    ["a listed pull request only", { parents: [], pulls: ["acme/tools#2"] }],
  ])("gives today's actions for scope.test.ts's pull requests with %s", async (_, list) => {
    const snapshot = snapshotOf(repo(scopePulls, queueOf(9)));
    const sharedScope = await sharedLabelScope(issues, "acme", snapshot, list, "halonic-dev");
    const remembered = scopePulls.map((each) => ready(each.number, 11));
    const { notices } = expectParity(snapshot, stateOf(remembered), passSettings({ sharedScope }));
    expect(notices.filter((each) => each.stage === "wrong_label").length).toBeGreaterThan(0);
  });

  test("gives today's actions for pass.test.ts's passes, each from the state the one before kept", () => {
    const settings = passSettings({ sharedScope: { pulls: new Set(), tasks: new Set() } });
    const unknown = snapshotOf(repo([pull(201, { ...liamApproved, ...labelBy(null) })]));
    const second = fastTrackPass(unknown, emptyState, settings, now).state;
    expect(expectParity(unknown, emptyState, settings).notices).toHaveLength(2);
    expect(expectParity(unknown, second, settings).notices).toEqual([]);
    const labelled = snapshotOf(repo([pull(202, liamApproved)]));
    const kept = fastTrackPass(labelled, emptyState, settings, now).state;
    const lost = snapshotOf(repo([pull(202, { ...liamApproved, labels: [] })]));
    expect(expectParity(lost, kept, settings).tracked).toEqual({});
    const waiting = [1, 2, 3, 4].map((number) =>
      entry(300 + number, number + 1, { enqueuedAt: ago(40 - number) }),
    );
    const jumping = entry(204, 1, { enqueuedAt: ago(20), groupHead: null, groupCiOk: null });
    const inQueue = snapshotOf(repo([queued(204), merged(299, 30)], [jumping, ...waiting]));
    expect(expectParity(inQueue, emptyState, settings).tracked).toHaveProperty(["acme/tools#204"]);
    const queuedState = fastTrackPass(inQueue, emptyState, settings, now).state;
    const done = expectParity(snapshotOf(repo([merged(204, 0)])), queuedState, settings);
    expect(done.notices.map((each) => each.stage)).toEqual(["merged"]);
  });

  test("takes the signal's settings: a later escalation, a later ask, a jump only past more", () => {
    const before = stateOf([reviewing(20)]);
    const later = {
      ...defaults,
      reviewEscalateMinutes: 30,
      enqueueAfterMinutes: 15,
      jumpAhead: 10,
    };
    const stages = (snapshot: Snapshot, state: FastTrackState) =>
      rule(snapshot, state, passSettings(), later).notices.map(
        (each) => (each as { stage: string }).stage,
      );
    expect(stages(snapshotOf(repo([pull(122)])), before)).toEqual(["review_nudge"]);
    const green = snapshotOf(repo([pull(113, liamApproved)], queueOf(10)));
    expect(stages(green, stateOf([ready(113, 11)]))).toEqual([]);
    const asked = rule(green, stateOf([ready(113, 16)]), passSettings(), later).notices[0];
    expect(asked).toMatchObject({
      stage: "enqueue_ask",
      text: expect.stringMatching(/without a jump \(10 in the queue\)/),
    });
  });
});
