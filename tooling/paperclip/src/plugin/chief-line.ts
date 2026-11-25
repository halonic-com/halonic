import type {
  PluginAgentsClient,
  PluginApiRequestInput,
  PluginApiResponse,
  PluginConfigClient,
  PluginIssuesClient,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import {
  type ChiefLineRecord,
  type ChiefLineSettings,
  callerPattern,
  chiefLineRouteKeys,
  chiefLineStateKey,
  readChiefLineSettings,
  threadTitle,
  webhookAllowed,
} from "./chief-line-settings.ts";

/**
 * The chief line (board supervisor to Chief): one task per caller, assigned
 * to Chief, where the caller posts and Chief answers. Three board-only routes:
 * open the thread, read the thread, subscribe a webhook. Callers post on the
 * thread as their own Paperclip user through the normal comments API. The
 * wake and the reply signal live in src/plugin/chief-line-signal.ts.
 */

/** What the chief line uses from the plugin context, so tests can fake it. */
export interface ChiefLineApi {
  readonly issues: Pick<
    PluginIssuesClient,
    "list" | "get" | "create" | "listComments" | "requestWakeup"
  >;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly state: Pick<PluginStateClient, "get" | "set">;
  readonly config: Pick<PluginConfigClient, "get">;
}

/** A caller's thread as the plugin keeps it. */
export interface ChiefLineThread {
  readonly id: string;
  readonly identifier: string;
}

type Records<T> = Record<string, T>;

/** Reads one of the chief line's records, an empty object when there is none. */
export async function readRecords<T>(
  ctx: Pick<ChiefLineApi, "state">,
  companyId: string,
  key: ChiefLineRecord,
): Promise<Records<T>> {
  const saved = await ctx.state.get(chiefLineStateKey(companyId, key));
  return saved !== null && typeof saved === "object" ? (saved as Records<T>) : {};
}

/** Chief's agent id: the agent named Chief, or with url key `chief`. */
export async function chiefAgentId(
  ctx: Pick<ChiefLineApi, "agents">,
  companyId: string,
): Promise<string | undefined> {
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  return agents.find((agent) => agent.urlKey === "chief" || agent.name.toLowerCase() === "chief")
    ?.id;
}

/** The fields of a task the chief line looks at. */
interface ThreadIssue {
  readonly id: string;
  readonly identifier?: string | null;
  readonly title: string;
  readonly status: string;
  readonly projectId?: string | null;
  readonly createdAt: Date | string;
}

/** Whether a task is a live chief-line thread of `caller` in the line's project (done is fine). */
export const isLiveThread = (issue: ThreadIssue | null, caller: string, projectId: string) =>
  issue !== null &&
  issue.status !== "cancelled" &&
  issue.title === threadTitle(caller) &&
  issue.projectId === projectId;

const asThread = (issue: ThreadIssue): ChiefLineThread => ({
  id: issue.id,
  identifier: issue.identifier ?? issue.id,
});

/** Stores a caller's thread, unless it is already the stored one. */
export async function rememberThread(
  ctx: Pick<ChiefLineApi, "state">,
  companyId: string,
  caller: string,
  thread: ChiefLineThread,
): Promise<void> {
  const threads = await readRecords<ChiefLineThread>(ctx, companyId, "threads");
  const known = threads[caller];
  if (known?.id === thread.id && known.identifier === thread.identifier) {
    return;
  }
  await ctx.state.set(chiefLineStateKey(companyId, "threads"), { ...threads, [caller]: thread });
}

/**
 * The caller's thread: the stored one while it is still a live `[chief-line] <caller>` task in
 * the project, else the newest such task (the board may create it itself), else a new one.
 */
async function findOrCreateThread(
  ctx: ChiefLineApi,
  companyId: string,
  caller: string,
  projectId: string,
  chiefId: string,
): Promise<ChiefLineThread> {
  const known = (await readRecords<ChiefLineThread>(ctx, companyId, "threads"))[caller];
  if (known !== undefined) {
    const issue = await ctx.issues.get(known.id, companyId);
    if (isLiveThread(issue, caller, projectId) && issue !== null) {
      const thread = asThread(issue);
      await rememberThread(ctx, companyId, caller, thread);
      return thread;
    }
  }
  const listed = await ctx.issues.list({ companyId, projectId, limit: 500 });
  const newest = listed
    .filter((candidate) => isLiveThread(candidate, caller, projectId))
    .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())[0];
  const issue =
    newest ??
    (await ctx.issues.create({
      companyId,
      projectId,
      title: threadTitle(caller),
      description: `The chief line for ${caller}: it posts here, and Chief answers here.`,
      status: "todo",
      assigneeAgentId: chiefId,
    }));
  const thread = asThread(issue);
  await rememberThread(ctx, companyId, caller, thread);
  return thread;
}

/** Counts one wake against the caller's hourly limit; false when the limit is reached. */
export async function takeSlot(
  ctx: Pick<ChiefLineApi, "state">,
  companyId: string,
  record: "wakes",
  caller: string,
  max: number,
  now: Date,
): Promise<boolean> {
  const taken = await readRecords<string[]>(ctx, companyId, record);
  const hourAgo = now.getTime() - 3_600_000;
  const recent = (taken[caller] ?? []).filter((at) => Date.parse(at) > hourAgo);
  if (recent.length >= max) {
    return false;
  }
  await ctx.state.set(chiefLineStateKey(companyId, record), {
    ...taken,
    [caller]: [...recent, now.toISOString()],
  });
  return true;
}

const fail = (status: number, error: string): PluginApiResponse => ({ status, body: { error } });

async function openThread(
  ctx: ChiefLineApi,
  companyId: string,
  settings: ChiefLineSettings,
  body: Records<unknown>,
): Promise<PluginApiResponse> {
  const { caller } = body;
  if (typeof caller !== "string" || !callerPattern.test(caller)) {
    return fail(400, "caller must match ^[a-z0-9][a-z0-9-]{0,40}$.");
  }
  if (settings.projectId === undefined) {
    return fail(409, "The chief line has no project: set chiefLine.projectId.");
  }
  const chiefId = await chiefAgentId(ctx, companyId);
  if (chiefId === undefined) {
    return fail(409, "No agent named Chief in this company.");
  }
  const thread = await findOrCreateThread(ctx, companyId, caller, settings.projectId, chiefId);
  return { status: 200, body: { threadId: thread.id, identifier: thread.identifier } };
}

async function readThread(
  ctx: ChiefLineApi,
  companyId: string,
  query: Records<string | string[]>,
): Promise<PluginApiResponse> {
  const caller = query["caller"];
  if (typeof caller !== "string" || !callerPattern.test(caller)) {
    return fail(400, "caller must match ^[a-z0-9][a-z0-9-]{0,40}$.");
  }
  const sinceRaw = query["since"];
  const since = typeof sinceRaw === "string" && sinceRaw !== "" ? Date.parse(sinceRaw) : 0;
  if (Number.isNaN(since)) {
    return fail(400, "since must be an ISO time.");
  }
  const thread = (await readRecords<ChiefLineThread>(ctx, companyId, "threads"))[caller];
  if (thread === undefined) {
    return fail(404, `No chief line thread for ${caller} yet.`);
  }
  const comments = await ctx.issues.listComments(thread.id, companyId);
  const after = comments
    .map((comment) => ({ comment, at: new Date(comment.createdAt) }))
    .filter(({ at }) => at.getTime() > since)
    .map(({ comment, at }) => ({
      id: comment.id,
      authorKind: authorKind(comment),
      createdAt: at.toISOString(),
      body: comment.body,
    }));
  return {
    status: 200,
    body: { threadId: thread.id, identifier: thread.identifier, comments: after },
  };
}

function authorKind(comment: { authorAgentId: string | null; authorUserId: string | null }) {
  if (comment.authorAgentId !== null) {
    return "agent";
  }
  return comment.authorUserId === null ? "system" : "user";
}

async function subscribe(
  ctx: ChiefLineApi,
  companyId: string,
  settings: ChiefLineSettings,
  body: Records<unknown>,
): Promise<PluginApiResponse> {
  const { caller, url } = body;
  if (typeof caller !== "string" || !callerPattern.test(caller)) {
    return fail(400, "caller must match ^[a-z0-9][a-z0-9-]{0,40}$.");
  }
  if (typeof url !== "string" || !webhookAllowed(url, settings.webhookHosts)) {
    return fail(400, "The webhook's host isn't in chiefLine.webhookHosts.");
  }
  const hooks = await readRecords<string>(ctx, companyId, "hooks");
  await ctx.state.set(chiefLineStateKey(companyId, "hooks"), { ...hooks, [caller]: url });
  return { status: 200, body: { caller, subscribed: true } };
}

/** Whether a route key is one of the chief line's. */
export const isChiefLineRoute = (routeKey: string) =>
  (Object.values(chiefLineRouteKeys) as string[]).includes(routeKey);

/** Answers the chief line's three routes, for a signed-in board user only. */
export async function handleChiefLineRequest(
  input: PluginApiRequestInput,
  ctx: ChiefLineApi,
): Promise<PluginApiResponse> {
  const userId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  if (typeof userId !== "string" || userId === "") {
    return fail(403, "Only the board can use the chief line.");
  }
  const settings = readChiefLineSettings(await ctx.config.get(input.companyId));
  if (!settings.enabled) {
    return fail(409, "The chief line is off: set chiefLine.enabled.");
  }
  const body = (input.body ?? {}) as Records<unknown>;
  switch (input.routeKey) {
    case chiefLineRouteKeys.openThread:
      return await openThread(ctx, input.companyId, settings, body);
    case chiefLineRouteKeys.thread:
      return await readThread(ctx, input.companyId, input.query);
    default:
      return await subscribe(ctx, input.companyId, settings, body);
  }
}
