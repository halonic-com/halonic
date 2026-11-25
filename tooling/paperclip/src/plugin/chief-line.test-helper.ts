import type { PluginApiRequestInput, PluginEvent } from "@paperclipai/plugin-sdk";
import type { ChiefLineSignalApi } from "./chief-line-signal.ts";
import { fakeState } from "./fake-host.test-helper.ts";

/** A comment as the chief line's fake host keeps it. */
export interface LineComment {
  readonly id: string;
  readonly body: string;
  readonly authorAgentId: string | null;
  readonly authorUserId: string | null;
  readonly createdAt: Date;
}

/**
 * A plugin context for the chief line with one made-up company `acme`, agents
 * Chief and Ravi, issues and comments in memory, and a webhook endpoint that
 * answers with the given statuses in turn (200 once they run out).
 */
export function fakeChiefLine(
  options: { config?: Record<string, unknown>; hookStatuses?: number[] } = {},
) {
  const { state } = fakeState();
  const issues: {
    id: string;
    identifier: string;
    title: string;
    status: string;
    projectId?: string;
    createdAt: Date;
    companyId?: string;
    assigneeAgentId?: string;
  }[] = [];
  const comments: Record<string, LineComment[]> = {};
  const created: unknown[] = [];
  const wakes: { issueId: string; options: unknown }[] = [];
  const posts: { url: string; body: unknown }[] = [];
  const updates: { issueId: string; patch: unknown }[] = [];
  /** Like the live host: only these statuses can be woken (not blocked); others throw. */
  const wakeable = new Set(["todo", "in_progress"]);
  let wakeFails = false;
  const agents = [
    { id: "agent-chief", name: "Chief", urlKey: "chief" },
    { id: "agent-ravi", name: "Ravi", urlKey: "ravi" },
  ];
  const createCommentOptions: unknown[] = [];
  const logs: string[] = [];
  const statuses = [...(options.hookStatuses ?? [])];
  const config = options.config ?? {
    chiefLine: {
      enabled: true,
      projectId: "proj-1",
      webhookHosts: ["hooks.acme.test"],
      maxPerHour: 3,
    },
  };
  const ctx = {
    state,
    config: { get: async () => config },
    agents: { list: async () => agents },
    issues: {
      list: async (input: { projectId?: string }) =>
        issues.filter(
          (issue) => input.projectId === undefined || issue.projectId === input.projectId,
        ),
      get: async (ref: string) =>
        issues.find((issue) => issue.id === ref || issue.identifier === ref) ?? null,
      create: async (input: {
        companyId?: string;
        title: string;
        status?: string;
        projectId?: string;
        assigneeAgentId?: string;
      }) => {
        created.push(input);
        const issue = {
          ...input,
          id: `issue-${issues.length + 1}`,
          identifier: `ACME-${issues.length + 1}`,
          status: input.status ?? "todo",
          createdAt: new Date(Date.UTC(2026, 10, 25, 9, issues.length)),
        };
        issues.push(issue);
        return issue;
      },
      // A plugin-authored comment: no agent and no user author.
      createComment: async (issueId: string, body: string, _companyId: string, opts?: unknown) => {
        createCommentOptions.push(opts);
        return addComment(issueId, body, null, null);
      },
      listComments: async (issueId: string) => comments[issueId] ?? [],
      update: async (issueId: string, patch: { status?: string }) => {
        updates.push({ issueId, patch });
        const issue = issues.find((candidate) => candidate.id === issueId);
        if (issue !== undefined && patch.status !== undefined) {
          issue.status = patch.status;
        }
        return issue;
      },
      requestWakeup: async (issueId: string, _companyId: string, opts: unknown) => {
        const status = issues.find((candidate) => candidate.id === issueId)?.status;
        if (wakeFails || status === undefined || !wakeable.has(status)) {
          throw new Error("Issue is not wakeable");
        }
        wakes.push({ issueId, options: opts });
        return {};
      },
    },
    http: {
      fetch: async (url: string, init?: RequestInit) => {
        posts.push({ url, body: JSON.parse(String(init?.body)) });
        // Like the SDK's worker, which rebuilds the host's answer with its (empty string) body:
        // for a 204 that constructor throws after the request was sent.
        return new Response("", { status: statuses.shift() ?? 200 });
      },
    },
    logger: { info: (m: string) => logs.push(m), error: (m: string) => logs.push(m) },
  };
  function addComment(
    issueId: string,
    body: string,
    agentId: string | null,
    userId: string | null,
  ) {
    const list = comments[issueId] ?? [];
    const comment = {
      id: `c${Object.values(comments).flat().length + 1}`,
      body,
      authorAgentId: agentId,
      authorUserId: userId,
      createdAt: new Date(Date.UTC(2026, 10, 25, 10, list.length)),
    };
    comments[issueId] = [...list, comment];
    return comment;
  }
  return {
    ctx: ctx as unknown as ChiefLineSignalApi,
    issues,
    comments,
    created,
    wakes,
    posts,
    updates,
    failWakes: () => {
      wakeFails = true;
    },
    agents,
    createCommentOptions,
    logs,
    addComment,
  };
}

/** A board user's request to a chief line route in company `acme`. */
export function lineRequest(
  routeKey: string,
  body: unknown,
  query: Record<string, string> = {},
  actor: object = { actorType: "user", actorId: "user-1", userId: "user-1" },
): PluginApiRequestInput {
  return {
    routeKey,
    method: "POST",
    path: "",
    params: {},
    query,
    body,
    headers: {},
    companyId: "acme",
    actor,
  } as unknown as PluginApiRequestInput;
}

/** The `issue.comment.created` event for a comment on `issueId`. */
export function commentEvent(issueId: string, commentId: string): PluginEvent {
  return {
    eventId: `e-${commentId}`,
    eventType: "issue.comment.created",
    occurredAt: "2026-11-25T10:00:00.000Z",
    companyId: "acme",
    entityId: issueId,
    payload: { issueId, commentId },
  } as PluginEvent;
}
