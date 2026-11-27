// A Paperclip stand-in for the Inbox's action requests (HAL-18517): an invented Acme company with
// one task whose card pins a stepper request. It answers only the requests it expects and records
// any other, so a test sees a stray call; `paperclip-client`'s own fake isn't part of its entry.

/** A made-up key; no real Paperclip ever saw it. */
export const acmeKey = "made-up-acme-key-for-tests-only";
/** The invented Acme company. */
export const acmeCompany = "c0000000-0000-4000-8000-000000000001";
const acmeTask = "i0000000-0000-4000-8000-000000000001";
const acmeCard = "f0000000-0000-4000-8000-000000000001";
const revision = "d0000000-0000-4000-8000-000000000001";
const agentBo = "a0000000-0000-4000-8000-000000000001";

/** A request for one whole shipped stepper: upload the social preview of `acme/app`. */
export const socialPreviewRequest = JSON.stringify({
  format: "halonic.stepper-request/1",
  title: "Upload the social preview",
  reason: "The launch post links the repository.",
  blocks: [
    {
      kind: "use",
      ref: "github.upload-social-preview@1",
      parameters: { owner: "acme", repo: "app" },
    },
  ],
});

/** One request the fake saw: method and path, without the query. */
export type SeenRequest = `${string} /${string}`;

/** Acme's answers, by `method path`, with Bo's card made at `madeAt` pinning `request`. */
function acmeRoutes(request: string, madeAt: string): Map<string, unknown> {
  const company = `/api/companies/${acmeCompany}`;
  const card = {
    id: acmeCard,
    kind: "request_confirmation",
    status: "pending",
    createdByAgentId: agentBo,
    payload: {
      version: 1,
      prompt: "The launch needs the repository's preview image.",
      target: {
        type: "issue_document",
        issueId: acmeTask,
        key: "stepper-request",
        revisionId: revision,
      },
    },
    createdAt: madeAt,
  };
  const task = {
    id: acmeTask,
    identifier: "ACME-7",
    title: "Prepare the launch",
    status: "in_review",
    assigneeAgentId: agentBo,
    updatedAt: madeAt,
  };
  const documents = `/api/issues/${acmeTask}/documents/stepper-request`;
  return new Map<string, unknown>([
    ["GET /api/cli-auth/me", { userId: "u-acme-board", user: { name: "Board" } }],
    [`GET ${company}/agents`, [{ id: agentBo, name: "Bo", title: null, status: "running" }]],
    [`GET ${company}/chats`, []],
    [`GET ${company}/issues`, [task]],
    [`GET ${company}/projects`, []],
    [`GET ${company}/approvals`, []],
    [`GET ${company}/decisions`, []],
    [`GET ${company}/secret-proposals`, []],
    [`GET ${company}/join-requests`, []],
    [`GET /api/issues/${acmeTask}/interactions`, [card]],
    [`GET /api/issues/${acmeTask}/attachments`, []],
    [
      `GET ${documents}/revisions/${revision}`,
      {
        id: revision,
        key: "stepper-request",
        body: request,
        latestRevisionId: revision,
        isLatest: true,
      },
    ],
    [`GET ${documents}`, { key: "stepper-request", body: request, latestRevisionId: revision }],
    ["GET /api/plugins/halonic.agent-tools/api/board/mentions", { mentions: [] }],
  ]);
}

/** Acme's Paperclip: answers its routes and records every request. */
export class AcmePaperclip {
  readonly address = "https://paperclip.acme.test";
  /** Requests it has no route for; a test expects none. */
  readonly unexpected: SeenRequest[] = [];
  readonly #routes: Map<string, unknown>;

  constructor(request: string, madeAt: string) {
    this.#routes = acmeRoutes(request, madeAt);
  }

  readonly fetch = async (input: Request | string | URL, init?: RequestInit): Promise<Response> => {
    const sent = new Request(input, init);
    const seen: SeenRequest = `${sent.method} ${new URL(sent.url).pathname as `/${string}`}`;
    const body = this.#routes.get(seen);
    if (body === undefined) {
      this.unexpected.push(seen);
      return Response.json({ error: "API route not found" }, { status: 404 });
    }
    return Response.json(body);
  };
}
