import { readFileSync } from "node:fs";
import type { FoundPulls, PullRef } from "./discover.ts";
import { gitHubReader } from "./github.ts";
import type { CommentRow, Paperclip, TaskRow } from "./paperclip.ts";

/** The recordings: trimmed real GitHub answers from 21 Nov, keyed by request path. */
export type RecordingName =
  | "green"
  | "merged-green"
  | "merged-main-green"
  | "merged-waiting"
  | "pull-lists"
  | "red-and-conflicting"
  | "review-finding";

/** Reads one recording. */
export function recording(name: RecordingName): Record<string, unknown> {
  const file = new URL(`./recordings/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

/** A GitHub that answers from recordings and remembers every request. */
export function fakeGitHub(...answers: Record<string, unknown>[]) {
  const routes: Record<string, unknown> = Object.assign({}, ...answers);
  const calls: { url: string; method: string }[] = [];
  const get = gitHubReader({
    token: "test-token",
    fetch: async (url, init) => {
      calls.push({ url, method: init.method });
      const { pathname, search } = new URL(url);
      const body = routes[pathname + search];
      return {
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
        json: async () => body,
      };
    },
  });
  return { get, calls };
}

/** The agents the fakes know: two authors and a reviewer. */
export const agents = { mateo: "agent-mateo", priya: "agent-priya", liam: "agent-liam" };

/** An open task, with the pull requests a branch search would find for it. */
export type FakeTask = TaskRow & { pulls: PullRef[] };

/** A comment by an agent. */
export function agentComment(authorAgentId: string, createdAt: string, body: string): CommentRow {
  return { authorAgentId, authorUserId: null, createdAt, body };
}

/** A Paperclip with tasks in memory; comments, wake-ups and status changes land in its lists. */
export function fakePaperclip(tasks: FakeTask[], comments: Record<string, CommentRow[]> = {}) {
  const done: string[] = [];
  const wakes: { taskId: string; key: string }[] = [];
  const append = (taskId: string, body: string) => {
    const createdAt = new Date(
      Date.parse("2026-11-21T22:00:00Z") + Object.keys(comments).length,
    ).toISOString();
    // A plugin's comment has neither an agent nor a user as author.
    comments[taskId] = [
      ...(comments[taskId] ?? []),
      { authorAgentId: null, authorUserId: null, createdAt, body },
    ];
  };
  const paperclip: Paperclip = {
    openTasks: async () => tasks.filter((task) => !done.includes(task.id)),
    comments: async (taskId) => [...(comments[taskId] ?? [])].reverse(),
    agents: async () => Object.entries(agents).map(([urlKey, id]) => ({ urlKey, id })),
    wake: async (taskId, body, key) => {
      append(taskId, body);
      wakes.push({ taskId, key });
    },
    markDone: async (taskId, body) => {
      done.push(taskId);
      append(taskId, body);
    },
  };
  const discover = async (): Promise<FoundPulls> =>
    new Map(tasks.map((task) => [task.identifier, task.pulls]));
  return { paperclip, discover, comments, done, wakes };
}

/** An open task with one pull request on halonic, on a branch of `assignee` unless `branch` says otherwise. */
export function task(
  number: number,
  assignee: string,
  extra: Partial<TaskRow> & { branch?: string } = {},
): FakeTask {
  const { branch, ...rest } = extra;
  const owner = Object.entries(agents).find(([, id]) => id === assignee)?.[0] ?? "nobody";
  return {
    id: `task-${number}`,
    identifier: `HAL-${number}`,
    assigneeAgentId: assignee,
    running: false,
    openChildren: false,
    monitorNextCheckAt: null,
    monitorLastTriggeredAt: null,
    pulls: [
      { repo: "halonic-com/halonic", number, branch: branch ?? `${owner}/HAL-${number}-work` },
    ],
    ...rest,
  };
}
