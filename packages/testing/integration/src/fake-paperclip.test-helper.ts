// A Paperclip stand-in for the phone's messaging interop test (HAL-17643): an invented Acme
// company with one card the phone may answer, one risky approval and a GitHub snapshot with a
// merge queue. It answers only the requests it expects and records any other, so a test sees a
// stray call; `paperclip-client`'s own, richer fake isn't part of that package's entry.

/** A made-up key; no real Paperclip ever saw it. */
export const acmeKey = "made-up-acme-key-for-tests-only";
export const acmeCompany = "c0000000-0000-4000-8000-000000000001";
export const acmeTask = "i0000000-0000-4000-8000-000000000001";
export const acmeCard = "f0000000-0000-4000-8000-000000000001";
const acmeApproval = "p0000000-0000-4000-8000-000000000001";
const agentBo = "a0000000-0000-4000-8000-000000000001";
const takenAt = "2026-11-24T10:00:00.000Z";

/** One request the fake saw: method and path, without the query. */
export type SeenRequest = `${string} /${string}`;

/** A pull request of the GitHub snapshot. */
function pull(number: number, inQueue: boolean) {
  return {
    number,
    title: `Change ${number}`,
    author: { kind: "agent", name: "bo" },
    work: "ACME-7",
    state: "open",
    updatedAt: takenAt,
    mergedAt: null,
    draft: false,
    mergeable: "yes",
    ciOk: "success",
    inQueue,
    fastTrack: false,
    approvedBy: [],
    failedCheck: null,
    reviewCounts: null,
    dequeued: null,
  };
}

/** A waiting entry of the merge queue. */
function queued(number: number, position: number) {
  return {
    number,
    position,
    state: "QUEUED",
    enqueuedAt: takenAt,
    groupHead: null,
    estimatedSeconds: null,
    groupCiOk: null,
    jobsWaiting: 0,
    waitingSince: null,
  };
}

/** Acme's answers, by `method path`. */
function acmeRoutes(): Map<string, unknown> {
  const company = `/api/companies/${acmeCompany}`;
  const card = {
    id: acmeCard,
    kind: "request_confirmation",
    status: "pending",
    createdByAgentId: agentBo,
    payload: { version: 1, prompt: "Launch on Friday?", acceptLabel: "Yes, Friday" },
    createdAt: takenAt,
  };
  const approval = {
    id: acmeApproval,
    type: "hire_agent",
    status: "pending",
    requestedByAgentId: agentBo,
    payload: { title: "Hire a designer", summary: "One more seat" },
    createdAt: takenAt,
  };
  const task = {
    id: acmeTask,
    identifier: "ACME-7",
    title: "Pick a launch date",
    status: "in_review",
    assigneeAgentId: agentBo,
    updatedAt: takenAt,
  };
  const snapshot = {
    takenAt,
    repos: [
      {
        repo: "acme/app",
        defaultBranch: "main",
        open: [pull(11, true), pull(12, true)],
        recent: [],
        queue: [queued(11, 1), queued(12, 2)],
      },
    ],
  };
  return new Map<string, unknown>([
    [`GET ${company}/agents`, [{ id: agentBo, name: "Bo", title: null, status: "running" }]],
    [`GET ${company}/chats`, []],
    [`GET ${company}/issues`, [task]],
    [`GET ${company}/projects`, []],
    [`GET ${company}/approvals`, [approval]],
    [`GET ${company}/decisions`, []],
    [`GET ${company}/secret-proposals`, []],
    [`GET ${company}/join-requests`, []],
    [`GET /api/approvals/${acmeApproval}/issues`, []],
    [`GET /api/issues/${acmeTask}/interactions`, [card]],
    [
      `POST /api/issues/${acmeTask}/interactions/${acmeCard}/accept`,
      { ...card, status: "accepted" },
    ],
    ["GET /api/plugins/halonic.agent-tools/api/github/summary", snapshot],
  ]);
}

/** Acme's Paperclip: answers its routes, records every request, and fails offline. */
export class FakePaperclip {
  readonly address = "https://paperclip.acme.test";
  /** Every request it answered, in order. */
  readonly seen: SeenRequest[] = [];
  /** Requests it has no route for; a test expects none. */
  readonly unexpected: SeenRequest[] = [];
  /** While set, `fetch` fails as it does with no network. */
  offline = false;
  readonly #routes = acmeRoutes();

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    if (this.offline) throw new TypeError("fetch failed");
    const request = new Request(input, init);
    const seen: SeenRequest = `${request.method} ${new URL(request.url).pathname as `/${string}`}`;
    const body = this.#routes.get(seen);
    if (body === undefined) {
      this.unexpected.push(seen);
      return Response.json({ error: "API route not found" }, { status: 404 });
    }
    this.seen.push(seen);
    return Response.json(body);
  };

  /** How many times it answered `request`. */
  count(request: SeenRequest): number {
    return this.seen.filter((seen) => seen === request).length;
  }
}
