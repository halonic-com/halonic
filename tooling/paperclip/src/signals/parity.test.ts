import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type Memory, type PullFacts, decide as watcherDecide } from "../pr-watcher/decide.ts";
import { fakeGitHub, recording, restFacts } from "../pr-watcher/fakes.test-helper.ts";
import { decisionActions, watchedTask } from "./pr-watcher-input.ts";
import { decide } from "./rules/pr-watcher.ts";

/**
 * Today's PR watcher, replayed through the signal rule (HAL-17980): every
 * recorded pull request state, alone and together, with each task and
 * memory variant, gives the same actions from both.
 */

const halonic = "halonic-com/halonic";
const recorded = [4605, 4485, 468, 4574, 4614, 4588];
const before = "2026-11-20T00:00:00Z";
const after = "2026-11-30T00:00:00Z";

async function recordedFacts(): Promise<Map<number, PullFacts>> {
  const github = fakeGitHub(
    recording("green"),
    recording("merged-green"),
    recording("merged-main-green"),
    recording("merged-waiting"),
    recording("red-and-conflicting"),
    recording("review-finding"),
  );
  const facts = await restFacts(github.get)(
    recorded.map((number) => ({ repo: halonic, number, branch: `mateo/HAL-${number}-work` })),
  );
  return new Map(
    recorded.map((number) => [number, facts.get(`${halonic}#${number}`) as PullFacts]),
  );
}

/** The open pull request's other states the REST recordings don't hold. */
function variants(open: PullFacts): PullFacts[] {
  return [
    { ...open, retargeted: true },
    { ...open, held: { url: "https://example.com/run/1", jobs: ["test"], error: null } },
    { ...open, githubApproval: { by: "acme-reviewer", head: open.head } },
    { ...open, conflicting: true, draft: true },
    { ...open, conflicting: true, inQueue: true },
  ];
}

function pullSets(facts: Map<number, PullFacts>): PullFacts[][] {
  const at = (number: number) => facts.get(number) as PullFacts;
  const merged = (pull: PullFacts) => ({
    ...pull,
    mergedAt: pull.state === "merged" ? before : undefined,
  });
  const singles = recorded.map((number) => [merged(at(number))]);
  return [
    ...singles,
    [merged(at(4485)), merged(at(4614))],
    [merged(at(4485)), merged(at(4574))],
    [merged(at(4485)), merged(at(468))],
    ...variants(at(4605)).map((pull) => [pull]),
    ...variants(at(4588)).map((pull) => [pull]),
  ];
}

function memories(pulls: readonly PullFacts[]): Memory[] {
  const empty: Memory = {
    reported: new Set(),
    seenUntil: undefined,
    heldAt: undefined,
    lastCommentAt: undefined,
  };
  const keys = pulls.flatMap((pull) => {
    const at = `${pull.repo}#${pull.number} ${pull.head.slice(0, 7)}`;
    return [
      `${at} ci-red`,
      `${at} conflict`,
      `${at} merged`,
      `${at} review ${pull.latestReview?.id}`,
    ];
  });
  return [
    empty,
    { ...empty, reported: new Set(keys) },
    { ...empty, seenUntil: after },
    { ...empty, heldAt: after },
    { ...empty, heldAt: "2026-11-01T00:00:00Z" },
    { ...empty, lastCommentAt: after },
    { ...empty, lastCommentAt: after, reported: new Set(keys) },
  ];
}

const tasks = [
  { owner: "agent-mateo", task: {} },
  { owner: "agent-mateo", task: { running: true } },
  { owner: "agent-mateo", task: { openChildren: true } },
  { owner: "agent-mateo", task: { parked: true } },
  { owner: "agent-priya", task: {} },
  { owner: undefined, task: {} },
];

const allWakes = [
  "ci-red",
  "conflict",
  "retargeted",
  "review",
  "approved",
  "merged",
  "held",
] as const;

/** Every case: each pull request set with each memory and task variant. */
function cases(facts: Map<number, PullFacts>) {
  return pullSets(facts).flatMap((pulls) =>
    memories(pulls).flatMap((memory) =>
      tasks.map(({ owner, task }) => ({ pulls, memory, owner, task })),
    ),
  );
}

/** Today's watcher's actions and the rule's, for one case. */
function replay({ pulls, memory, owner, task: extra }: ReturnType<typeof cases>[number]) {
  const task = {
    id: "task-1",
    identifier: "HAL-1",
    assigneeAgentId: "agent-mateo",
    running: false,
    openChildren: false,
    ...extra,
  };
  const today = decisionActions("HAL-1", watcherDecide(task, owner, pulls, memory));
  const input = {
    now: after,
    settings: { done: true, wakeOn: [...allWakes] },
    tasks: [watchedTask(task, owner, pulls, memory)],
  };
  return { today, rule: decide(JSON.parse(JSON.stringify(input))) };
}

verifies("paperclip.signal-pr-watcher", () => {
  test("gives the same actions as today's watcher for every recorded state, task and memory", async () => {
    const all = cases(await recordedFacts());
    const outcomes = new Set<string>();
    for (const each of all) {
      const { today, rule } = replay(each);
      expect(rule).toEqual(today);
      for (const action of today) {
        outcomes.add(action.kind === "wake" ? action.reason : "done");
      }
    }
    expect(all).toHaveLength(19 * 7 * 6);
    expect([...outcomes].sort()).toEqual([
      "approved",
      "ci-red",
      "conflict",
      "done",
      "held",
      "merged",
      "retargeted",
      "review",
    ]);
  });
});
