import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { PullFacts } from "./decide.ts";
import { type DoneOpenHost, type DoneTaskRow, doneOpenPass } from "./done-open.ts";
import { pullKey } from "./facts.ts";
import { agentComment, agents } from "./fakes.test-helper.ts";
import type { CommentRow } from "./paperclip.ts";

/**
 * Done tasks whose pull request is still open (HAL-18284). The replay is
 * HAL-17515: done while #6033 conflicted with `main` for 11 hours.
 */

const repo = "halonic-com/halonic";
const head = "6033aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Pull request `number` on Mateo's branch for `identifier`, open with green `ci-ok`. */
function openPull(number: number, identifier: string, extra: Partial<PullFacts> = {}): PullFacts {
  return {
    repo,
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state: "open",
    branch: `mateo/${identifier}-work`,
    head,
    ciOkOnHead: "success",
    draft: false,
    conflicting: false,
    inQueue: false,
    retargeted: false,
    latestReview: undefined,
    landed: false,
    mergedAt: undefined,
    ...extra,
  };
}

/** A Paperclip with done tasks; reopens, warnings and comments land in its lists. */
function fakeHost(tasks: Record<string, DoneTaskRow>, comments: Record<string, CommentRow[]> = {}) {
  const reopened: { taskId: string; key: string }[] = [];
  const warned: string[] = [];
  const append = (taskId: string, body: string) => {
    const createdAt = new Date(
      Date.parse("2026-11-25T09:00:00Z") + reopened.length + warned.length,
    );
    comments[taskId] = [
      ...(comments[taskId] ?? []),
      { authorAgentId: null, authorUserId: null, createdAt: createdAt.toISOString(), body },
    ];
  };
  const host: DoneOpenHost = {
    task: async (identifier) => tasks[identifier],
    comments: async (taskId) => [...(comments[taskId] ?? [])],
    agents: async () => Object.entries(agents).map(([urlKey, id]) => ({ urlKey, id })),
    reopen: async (taskId, body, key) => {
      append(taskId, body);
      reopened.push({ taskId, key });
      return "written";
    },
    warn: async (taskId, body) => {
      append(taskId, body);
      warned.push(taskId);
      return "written";
    },
  };
  return { host, reopened, warned, comments };
}

function doneTask(id: string): DoneTaskRow {
  return { id, status: "done", assigneeAgentId: agents.mateo, running: false };
}

async function pass(fake: ReturnType<typeof fakeHost>, pulls: readonly PullFacts[]) {
  const found = new Map<string, { repo: string; number: number; branch: string }[]>();
  for (const pull of pulls) {
    const identifier = /HAL-\d+/.exec(pull.branch)?.[0] ?? "";
    found.set(identifier, [
      ...(found.get(identifier) ?? []),
      { repo, number: pull.number, branch: pull.branch },
    ]);
  }
  return doneOpenPass({
    host: fake.host,
    found,
    openPulls: new Set(pulls.filter((pull) => pull.state === "open").map(pullKey)),
    openTasks: new Set(),
    facts: async (refs) =>
      new Map(
        refs.flatMap((ref) =>
          pulls
            .filter((pull) => pullKey(pull) === pullKey(ref))
            .map((pull) => [pullKey(ref), pull] as const),
        ),
      ),
    conflictFiles: async () => ["src/pr-watcher/watch.ts"],
    dryRun: false,
    log: () => undefined,
  });
}

verifies("paperclip.pr-watcher-done-open", () => {
  test("HAL-17515 replay: a done task whose pull request conflicts goes to todo, woken once per head", async () => {
    const fake = fakeHost({ "HAL-17515": doneTask("task-17515") });
    const conflicting = openPull(6033, "HAL-17515", { conflicting: true });
    expect(await pass(fake, [conflicting])).toEqual({ reopened: 1, warned: 0, failed: [] });
    expect(fake.reopened).toEqual([
      { taskId: "task-17515", key: `done-open ${repo}#6033 6033aaa conflict` },
    ]);
    const body = fake.comments["task-17515"]?.[0]?.body ?? "";
    expect(body).toContain("back in `todo`");
    expect(body).toContain("src/pr-watcher/watch.ts");
    // Set to done again on the same head: no second wake.
    await pass(fake, [conflicting]);
    expect(fake.reopened).toHaveLength(1);
  });

  test("leaves a done task without an open pull request alone", async () => {
    const fake = fakeHost({ "HAL-4600": doneTask("task-4600") });
    const merged = openPull(4600, "HAL-4600", { state: "merged", landed: true });
    expect(await pass(fake, [merged])).toEqual({ reopened: 0, warned: 0, failed: [] });
    expect(fake.comments).toEqual({});
  });

  test("warns once per head on a manual done with an open pull request that can merge", async () => {
    const fake = fakeHost({ "HAL-4601": doneTask("task-4601") });
    const clean = openPull(4601, "HAL-4601");
    await pass(fake, [clean]);
    await pass(fake, [clean]);
    expect(fake.warned).toEqual(["task-4601"]);
    expect(fake.reopened).toEqual([]);
    expect(fake.comments["task-4601"]?.[0]?.body).toContain("#4601");
  });

  test("the moved-to line stops the warning", async () => {
    const moved = agentComment(
      agents.mateo,
      "2026-11-25T08:00:00.000Z",
      "Split the work.\nPR watcher: moved to HAL-4700",
    );
    const fake = fakeHost({ "HAL-4602": doneTask("task-4602") }, { "task-4602": [moved] });
    expect(await pass(fake, [openPull(4602, "HAL-4602", { conflicting: true })])).toEqual({
      reopened: 0,
      warned: 0,
      failed: [],
    });
  });
});
