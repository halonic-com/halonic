import type { Fetch } from "./github.ts";

/**
 * The few Paperclip API calls the PR watcher makes, with its own key. It
 * reads tasks, their linked pull requests and comments, and writes only
 * comments and a task's `done` status.
 */

/** An open task, as the watcher reads it. */
export interface TaskRow {
  readonly id: string;
  readonly identifier: string;
  readonly assigneeAgentId: string | null;
  readonly running: boolean;
}

/** A task comment: who wrote it, when, and what it says. */
export interface CommentRow {
  readonly authorAgentId: string | null;
  readonly createdAt: string;
  readonly body: string;
}

/** An agent: its id and the short name its branches start with. */
export interface AgentRow {
  readonly id: string;
  readonly urlKey: string;
}

/** The watcher's view of Paperclip. */
export interface Paperclip {
  openTasks(): Promise<TaskRow[]>;
  pullLinks(taskId: string): Promise<string[]>;
  comments(taskId: string): Promise<CommentRow[]>;
  agents(): Promise<AgentRow[]>;
  comment(taskId: string, body: string): Promise<void>;
  markDone(taskId: string, body: string): Promise<void>;
}

/** Where and as whom the watcher talks to Paperclip. */
export interface PaperclipOptions {
  readonly fetch: Fetch;
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly companyId: string;
  readonly runId?: string | undefined;
}

/** Statuses the watcher looks at. A blocked task waits on someone else. */
const watchedStatuses = "todo,in_progress,in_review";
const pageSize = 500;

type Call = (method: string, path: string, body?: unknown) => Promise<unknown>;

/** One API call with the watcher's key and run id, failing on any error answer. */
function caller(options: PaperclipOptions): Call {
  const base = new URL(options.apiUrl.replace(/\/+$/, "").replace(/\/api$/, ""));
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.apiKey}`,
    "content-type": "application/json",
  };
  if (options.runId !== undefined && options.runId !== "") {
    headers["x-paperclip-run-id"] = options.runId;
  }
  return async (method, path, body) => {
    const url = new URL(path, base);
    const init =
      body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(body) };
    const response = await options.fetch(url.href, init);
    if (!response.ok) {
      throw new Error(`Paperclip: ${method} ${url.pathname} answered ${response.status}.`);
    }
    return response.json();
  };
}

/** A Paperclip client limited to the calls the watcher needs. */
export function paperclipClient(options: PaperclipOptions): Paperclip {
  const call = caller(options);
  const company = `/api/companies/${options.companyId}`;
  return {
    async openTasks() {
      const tasks: TaskRow[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = (await call(
          "GET",
          `${company}/issues?status=${watchedStatuses}&limit=${pageSize}&offset=${offset}`,
        )) as (Omit<TaskRow, "running"> & { activeRun?: unknown })[];
        for (const { id, identifier, assigneeAgentId, activeRun } of page) {
          tasks.push({ id, identifier, assigneeAgentId, running: activeRun != null });
        }
        if (page.length < pageSize) {
          return tasks;
        }
      }
    },
    async pullLinks(taskId) {
      const products = (await call("GET", `/api/issues/${taskId}/work-products`)) as {
        type?: string;
        url?: string | null;
      }[];
      return products.flatMap((product) =>
        product.type === "pull_request" && typeof product.url === "string" ? [product.url] : [],
      );
    },
    async comments(taskId) {
      return (await call(
        "GET",
        `/api/issues/${taskId}/comments?order=desc&limit=100`,
      )) as CommentRow[];
    },
    async agents() {
      return (await call("GET", `${company}/agents`)) as AgentRow[];
    },
    async comment(taskId, body) {
      await call("POST", `/api/issues/${taskId}/comments`, { body });
    },
    async markDone(taskId, body) {
      await call("PATCH", `/api/issues/${taskId}`, { status: "done", comment: body });
    },
  };
}
