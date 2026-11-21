import { readFileSync } from "node:fs";
import { gitHubReader } from "./github.ts";
import type { CommentRow, Paperclip, TaskRow } from "./paperclip.ts";

/** The recordings: trimmed real GitHub answers from 21 Nov, keyed by request path. */
export type RecordingName =
  | "green"
  | "merged-green"
  | "merged-main-green"
  | "merged-waiting"
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

/** The agents the fakes know: two authors, a reviewer and the watcher itself. */
export const agents = { mateo: "agent-mateo", priya: "agent-priya", liam: "agent-liam" };
export const watcherId = "agent-watcher";

/** A Paperclip with tasks in memory; comments and status changes land in its lists. */
export function fakePaperclip(
  tasks: (TaskRow & { links: string[] })[],
  comments: Record<string, CommentRow[]> = {},
) {
  const done: string[] = [];
  const paperclip: Paperclip = {
    openTasks: async () => tasks.filter((task) => !done.includes(task.id)),
    pullLinks: async (taskId) => tasks.find((task) => task.id === taskId)?.links ?? [],
    comments: async (taskId) => [...(comments[taskId] ?? [])].reverse(),
    agents: async () => Object.entries(agents).map(([urlKey, id]) => ({ urlKey, id })),
    comment: async (taskId, body) => {
      const createdAt = new Date(
        Date.parse("2026-11-21T22:00:00Z") + Object.keys(comments).length,
      ).toISOString();
      comments[taskId] = [
        ...(comments[taskId] ?? []),
        { authorAgentId: watcherId, createdAt, body },
      ];
    },
    markDone: async (taskId, body) => {
      done.push(taskId);
      await paperclip.comment(taskId, body);
    },
  };
  return { paperclip, comments, done };
}

/** An open task linked to one pull request on halonic. */
export function task(number: number, assignee: string, extra: Partial<TaskRow> = {}) {
  return {
    id: `task-${number}`,
    identifier: `HAL-${number}`,
    assigneeAgentId: assignee,
    running: false,
    links: [`https://github.com/halonic-com/halonic/pull/${number}`],
    ...extra,
  };
}
