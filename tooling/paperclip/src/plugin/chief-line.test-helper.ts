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
  const issues: { id: string; identifier: string; title: string; assigneeAgentId?: string }[] = [];
  const comments: Record<string, LineComment[]> = {};
  const created: unknown[] = [];
  const wakes: { issueId: string; options: unknown }[] = [];
  const posts: { url: string; body: unknown }[] = [];
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
    agents: {
      list: async () => [
        { id: "agent-chief", name: "Chief", urlKey: "chief" },
        { id: "agent-ravi", name: "Ravi", urlKey: "ravi" },
      ],
    },
    issues: {
      list: async () => issues,
      create: async (input: { title: string; assigneeAgentId?: string }) => {
        created.push(input);
        const issue = {
          ...input,
          id: `issue-${issues.length + 1}`,
          identifier: `ACME-${issues.length + 1}`,
        };
        issues.push(issue);
        return issue;
      },
      createComment: async (
        issueId: string,
        body: string,
        _companyId: string,
        opts?: { actorUserId?: string },
      ) => addComment(issueId, body, null, opts?.actorUserId ?? null),
      listComments: async (issueId: string) => comments[issueId] ?? [],
      requestWakeup: async (issueId: string, _companyId: string, opts: unknown) => {
        wakes.push({ issueId, options: opts });
        return {};
      },
    },
    http: {
      fetch: async (url: string, init?: RequestInit) => {
        posts.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(null, { status: statuses.shift() ?? 200 });
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
