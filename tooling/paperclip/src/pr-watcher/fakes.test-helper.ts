import { readFileSync } from "node:fs";
import type { PullFacts } from "./decide.ts";
import type { FoundPulls, PullRef } from "./discover.ts";
import { type BaseGreenSince, baseGreenSince, type PullFactsReader, pullKey } from "./facts.ts";
import { ciOk, type GitHubGet, gitHubReader, inMergeQueue, latestReview } from "./github.ts";
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

/** The agents the fakes know: two authors and three reviewers. */
export const agents = {
  mateo: "agent-mateo",
  priya: "agent-priya",
  liam: "agent-liam",
  julian: "agent-julian",
  nora: "agent-nora",
};

/** An open task, with the pull requests a branch search would find for it. */
export type FakeTask = TaskRow & { pulls: PullRef[] };

/** A comment by an agent. */
export function agentComment(authorAgentId: string, createdAt: string, body: string): CommentRow {
  return { authorAgentId, authorUserId: null, createdAt, body };
}

/**
 * A Paperclip with tasks in memory; comments, wake-ups, status changes and
 * moved monitors land in its lists. Tasks in `closedMeanwhile` are listed as
 * open but closed by the time the watcher writes, as when their author closes
 * them during a pass. With `postponeRefusal`, every monitor move is refused
 * with that message.
 */
export function fakePaperclip(
  listed: FakeTask[],
  comments: Record<string, CommentRow[]> = {},
  closedMeanwhile: ReadonlySet<string> = new Set(),
  postponeRefusal?: string,
) {
  let tasks = listed;
  const done: string[] = [];
  const wakes: { taskId: string; key: string }[] = [];
  const postponed: { taskId: string; until: string }[] = [];
  const handoffs: { taskId: string; from: string; to: string; key: string }[] = [];
  const raised: { taskId: string; to: string }[] = [];
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
      if (closedMeanwhile.has(taskId)) {
        return "closed";
      }
      append(taskId, body);
      wakes.push({ taskId, key });
      return "written";
    },
    markDone: async (taskId, body) => {
      if (closedMeanwhile.has(taskId)) {
        return "closed";
      }
      done.push(taskId);
      append(taskId, body);
      return "written";
    },
    handOff: async (taskId, { from, to }, body, key) => {
      const held = tasks.find((each) => each.id === taskId);
      if (closedMeanwhile.has(taskId) || held?.assigneeAgentId !== from) {
        return "closed";
      }
      append(taskId, body);
      handoffs.push({ taskId, from, to, key });
      // The task is the reviewer's from now on, as in Paperclip.
      tasks = tasks.map((each) => (each.id === taskId ? { ...each, assigneeAgentId: to } : each));
      return "written";
    },
    note: async (taskId, body) => {
      if (closedMeanwhile.has(taskId)) {
        return "closed";
      }
      append(taskId, body);
      return "written";
    },
    postponeMonitor: async (taskId, until) => {
      if (postponeRefusal !== undefined) {
        throw new Error(postponeRefusal);
      }
      postponed.push({ taskId, until });
      return "postponed";
    },
    raisePriority: async (taskId, to) => {
      const held = tasks.find((each) => each.id === taskId);
      if (closedMeanwhile.has(taskId) || !["low", "medium"].includes(held?.priority ?? "")) {
        return "closed";
      }
      raised.push({ taskId, to });
      tasks = tasks.map((each) => (each.id === taskId ? { ...each, priority: to } : each));
      return "written";
    },
  };
  const discover = async (): Promise<FoundPulls> =>
    new Map(tasks.map((task) => [task.identifier, task.pulls]));
  return { paperclip, discover, comments, done, wakes, postponed, handoffs, raised };
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
    priority: "medium",
    pulls: [
      { repo: "halonic-com/halonic", number, branch: branch ?? `${owner}/HAL-${number}-work` },
    ],
    ...rest,
  };
}

interface Pull {
  readonly html_url: string;
  readonly state: "open" | "closed";
  readonly merged_at: string | null;
  readonly merge_commit_sha: string | null;
  readonly mergeable: boolean | null;
  readonly draft?: boolean;
  readonly head: { readonly sha: string; readonly ref: string };
  readonly base: { readonly ref: string };
}

/**
 * One pull request's facts from REST recordings: the watcher's reader before
 * the GitHub snapshot (HAL-16003), kept so the recorded cases still feed the
 * rules. The snapshot's own mapping is tested on GraphQL recordings.
 */
async function pullFacts(
  get: GitHubGet,
  ref: { repo: string; number: number },
  greenSince: BaseGreenSince,
): Promise<PullFacts> {
  const pull = (await get(`/repos/${ref.repo}/pulls/${ref.number}`)) as Pull;
  const common = {
    ...ref,
    url: pull.html_url,
    branch: pull.head.ref,
    head: pull.head.sha,
    ciOkOnHead: "missing",
    draft: pull.draft === true,
    conflicting: false,
    inQueue: false,
    retargeted: false,
    latestReview: undefined,
    landed: false,
    mergedAt: undefined,
  } as const;
  if (pull.merged_at !== null) {
    const mergeCommit = pull.merge_commit_sha ?? "";
    const landed =
      mergeCommit !== "" &&
      ((await ciOk(get, ref.repo, mergeCommit)) === "success" ||
        (await greenSince(ref.repo, pull.base.ref, mergeCommit)));
    return { ...common, state: "merged", landed, mergedAt: pull.merged_at };
  }
  if (pull.state === "closed") {
    return { ...common, state: "closed" };
  }
  // `mergeable` is null while GitHub is still working it out: not a conflict yet.
  const conflicting = pull.mergeable === false;
  const [ciOkOnHead, review, inQueue] = await Promise.all([
    ciOk(get, ref.repo, pull.head.sha),
    latestReview(get, ref.repo, ref.number, pull.head.sha),
    conflicting ? inMergeQueue(get, ref.repo, ref.number) : Promise.resolve(false),
  ]);
  return { ...common, state: "open", ciOkOnHead, conflicting, inQueue, latestReview: review };
}

/** Facts from REST recordings, as `tick` asks for them. */
export function restFacts(get: GitHubGet): PullFactsReader {
  const greenSince = baseGreenSince(get);
  return async (refs) =>
    new Map(
      await Promise.all(
        refs.map(async (ref) => [pullKey(ref), await pullFacts(get, ref, greenSince)] as const),
      ),
    );
}
