import {
  acmeData,
  approvalId,
  chatTask,
  company,
  me,
  plainTask,
  testKey,
  websiteProject,
} from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";

/** One request the fake saw. */
export interface SeenRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}

/** What a route answers. */
export interface FakeAnswer {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A route's handler: the request in, the answer out. */
export type FakeRoute = (request: SeenRequest) => FakeAnswer;

/**
 * A Paperclip stand-in that records every request and answers from its
 * routes. It speaks Web `Request` and `Response`: the client tests hand its
 * {@link fetch} to the client, and the transport tests put it behind a real
 * HTTP server on 127.0.0.1 (`security.test.ts`).
 */
export class FakePaperclip {
  readonly seen: SeenRequest[] = [];
  readonly routes = new Map<string, FakeRoute>();

  /** Where clients send requests; the transport tests set it to their server's address. */
  address = "https://paperclip.acme.test";

  /** A `fetch` that the fake answers, with no network in between. */
  readonly fetch = (input: Request | string | URL, init?: RequestInit): Promise<Response> =>
    this.handle(new Request(input, init));

  /** Answers `method path` with `route`; `path` is exact, without the query. */
  on(method: string, path: string, route: FakeRoute | FakeAnswer): this {
    this.routes.set(`${method} ${path}`, typeof route === "function" ? route : () => route);
    return this;
  }

  /** Serves the Acme data on Paperclip's routes. */
  serveAcme(data = acmeData()): this {
    return this.on("GET", `/api/companies/${company}/agents`, { body: data.agents })
      .on("GET", `/api/companies/${company}/chats`, { body: data.chats })
      .on("GET", `/api/companies/${company}/issues`, ({ query }) => ({
        body: asListed(matchingTasks(data.tasks, query.get("q")), query),
      }))
      .on("GET", `/api/issues/${chatTask}/comments`, { body: data.comments })
      .on("GET", `/api/issues/${chatTask}/interactions`, { body: [] })
      .on("GET", `/api/issues/${plainTask}/interactions`, () => ({ body: data.cards }))
      .on("GET", `/api/companies/${company}/approvals`, { body: data.approvals })
      .on("GET", `/api/companies/${company}/decisions`, ({ query }) => ({
        body: data.decisions.filter((decision) => decision.status === query.get("status")),
      }))
      .on("GET", `/api/companies/${company}/secret-proposals`, ({ query }) => ({
        body: byStatus(data.secretProposals, query.get("status")),
      }))
      .on("GET", `/api/companies/${company}/join-requests`, ({ query }) => ({
        body: byStatus(data.joinRequests, query.get("status")),
      }))
      .on("GET", `/api/companies/${company}/projects`, { body: data.projects })
      .on("GET", `/api/approvals/${approvalId}/issues`, {
        body: [{ id: plainTask, projectId: websiteProject }],
      });
  }

  /** Records `request` and answers it from the routes; 404 for anything else. */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const seen: SeenRequest = {
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      headers: request.headers,
      body: await bodyOf(request),
    };
    this.seen.push(seen);
    const route = this.routes.get(`${seen.method} ${seen.path}`);
    const answer =
      route === undefined ? { status: 404, body: { error: "API route not found" } } : route(seen);
    // Bytes, such as a picture, go as they are, with only the headers the route names.
    if (answer.body instanceof Uint8Array || answer.body instanceof ReadableStream) {
      return new Response(answer.body, {
        status: answer.status ?? 200,
        headers: answer.headers ?? {},
      });
    }
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { "content-type": "application/json", ...answer.headers },
    });
  }
}

/** A request's body: its form data for an upload, its JSON otherwise, `undefined` when empty. */
async function bodyOf(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.startsWith("multipart/form-data") === true) {
    return request.formData();
  }
  const text = await request.text();
  return text === "" ? undefined : JSON.parse(text);
}

/** `records` in `status`, or all of them without one, as Paperclip's list filters take it. */
function byStatus<T extends { status: string }>(records: readonly T[], status: string | null) {
  return status === null ? records : records.filter((record) => record.status === status);
}

/** The tasks Paperclip's `q=` would match: the query in the identifier, title or description, ignoring case. */
function matchingTasks<T extends object>(tasks: readonly T[], query: string | null): readonly T[] {
  if (query === null) {
    return tasks;
  }
  const needle = query.toLowerCase();
  return tasks.filter((task) =>
    ["identifier", "title", "description"].some((field) => {
      const value: unknown = (task as Record<string, unknown>)[field];
      return typeof value === "string" && value.toLowerCase().includes(needle);
    }),
  );
}

/** The opaque ID of the Acme connection's source. */
export const sourceId = "paperclip:acme";

/**
 * `tasks` as Paperclip's task list sends them for `query`: with `view=index` every task's
 * `description` is `null`, as Paperclip selects no description for a list view.
 */
export function asListed<Task extends object>(
  tasks: readonly Task[],
  query: URLSearchParams,
): (Task | (Task & { description: null }))[] {
  return query.get("view") === "index"
    ? tasks.map((task) => ({ ...task, description: null }))
    : [...tasks];
}

/** The opaque ID of card `id` on task `task`. */
export const cardId = (task: string, id: string): string => `${sourceId}:card:${task}:${id}`;

/** The time the tests' clients read from their clock. */
export const testNow = new Date("2026-11-24T10:10:00.000Z");

/** Whether the tests' network is down: `fetch` then fails as it does offline. */
export interface Network {
  offline: boolean;
}

/**
 * A client for the Acme connection on `paperclip`, whose network goes down with `network.offline`,
 * reporting the reads that fail without failing a list to `warn` when given.
 */
export function connect(
  paperclip: FakePaperclip,
  network: Network,
  warn?: (message: string) => void,
): PaperclipMessaging {
  return new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    userId: me,
    now: () => testNow,
    ...(warn === undefined ? {} : { warn }),
    fetch: (input, init) =>
      network.offline
        ? Promise.reject(new TypeError("fetch failed"))
        : paperclip.fetch(input, init),
  });
}
