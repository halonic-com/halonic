import type {
  PluginAgentsClient,
  PluginApiRequestInput,
  PluginApiResponse,
  PluginConfigClient,
  PluginIssuesClient,
  PluginStateClient,
} from "@paperclipai/plugin-sdk";
import { boardPost } from "./board-post.ts";
import {
  type ChiefLineRecord,
  type ChiefLineSettings,
  callerPattern,
  chiefLineRouteKeys,
  chiefLineStateKey,
  readChiefLineSettings,
  webhookAllowed,
} from "./chief-line-settings.ts";
import { reopenThread } from "./host.ts";
import {
  isChief,
  type LineTarget,
  resolveTarget,
  targetAgentName,
  targetKey,
  targetTitle,
} from "./line-target.ts";

/**
 * The chief line (board supervisor to Chief): one task per caller, assigned
 * to Chief, where the caller posts and Chief answers. Four board-only routes:
 * open the thread, send (the plugin posts the message as itself), read the
 * thread, subscribe a webhook. A plugin-authored comment has no human author,
 * so the runs it starts stay on the board's seats. The wake and the reply
 * signal live in src/plugin/chief-line-signal.ts.
 */

/** What the chief line uses from the plugin context, so tests can fake it. */
export interface ChiefLineApi {
  readonly issues: Pick<
    PluginIssuesClient,
    "list" | "get" | "create" | "update" | "createComment" | "listComments" | "requestWakeup"
  > & { readonly relations: Pick<PluginIssuesClient["relations"], "get" | "removeBlockers"> };
  readonly logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
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
  return agents.find(isChief)?.id;
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

/** Whether a task is a live thread titled `title` in the line's project (done is fine). */
export const isLiveThread = (issue: ThreadIssue | null, title: string, projectId: string) =>
  issue !== null &&
  issue.status !== "cancelled" &&
  issue.title === title &&
  issue.projectId === projectId;

const asThread = (issue: ThreadIssue): ChiefLineThread => ({
  id: issue.id,
  identifier: issue.identifier ?? issue.id,
});

/** Stores a line's thread under its key (src/plugin/line-target.ts), unless it is already stored. */
export async function rememberThread(
  ctx: Pick<ChiefLineApi, "state">,
  companyId: string,
  key: string,
  thread: ChiefLineThread,
): Promise<void> {
  const threads = await readRecords<ChiefLineThread>(ctx, companyId, "threads");
  const known = threads[key];
  if (known?.id === thread.id && known.identifier === thread.identifier) {
    return;
  }
  await ctx.state.set(chiefLineStateKey(companyId, "threads"), { ...threads, [key]: thread });
}

/**
 * The line's live thread: the stored one while it is still a live task with the line's title
 * in the project, else the newest such task (the board may create it itself).
 */
async function findThread(
  ctx: ChiefLineApi,
  companyId: string,
  target: LineTarget,
  projectId: string,
): Promise<ChiefLineThread | undefined> {
  const key = targetKey(target);
  const title = targetTitle(target);
  const known = (await readRecords<ChiefLineThread>(ctx, companyId, "threads"))[key];
  if (known !== undefined) {
    const issue = await ctx.issues.get(known.id, companyId);
    if (isLiveThread(issue, title, projectId) && issue !== null) {
      const thread = asThread(issue);
      await rememberThread(ctx, companyId, key, thread);
      return thread;
    }
  }
  const listed = await ctx.issues.list({ companyId, projectId, limit: 500 });
  const newest = listed
    .filter((candidate) => isLiveThread(candidate, title, projectId))
    .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())[0];
  if (newest === undefined) {
    return undefined;
  }
  const thread = asThread(newest);
  await rememberThread(ctx, companyId, key, thread);
  return thread;
}

/** The line's live thread, or a new one assigned to the line's agent. */
async function findOrCreateThread(
  ctx: ChiefLineApi,
  companyId: string,
  target: LineTarget,
  projectId: string,
  assigneeId: string,
): Promise<ChiefLineThread> {
  const found = await findThread(ctx, companyId, target, projectId);
  if (found !== undefined) {
    return found;
  }
  const agentName = targetAgentName(target);
  const issue = await ctx.issues.create({
    companyId,
    projectId,
    title: targetTitle(target),
    description: `The line from ${target.caller} to ${agentName}: it posts here, and ${agentName} answers here.`,
    status: "todo",
    assigneeAgentId: assigneeId,
  });
  const thread = asThread(issue);
  await rememberThread(ctx, companyId, targetKey(target), thread);
  return thread;
}

/** Statuses Chief can't be woken on (never `cancelled`, which isn't a live thread); a new message moves the thread back to `todo` first. */
const parkedStatuses = new Set(["backlog", "done", "blocked"]);

/**
 * Wakes the agent on a thread for one comment, first moving a `backlog`, `done` or `blocked` thread to `todo`
 * (the host wakes only open work). With `unblock` (line threads only, never an ordinary task), first removes
 * every blocked-by link on the thread: Chief links its follow-up tasks as blockers, and the host won't wake
 * a task with unresolved blockers. Logs a failure and answers false; never throws.
 */
export async function wakeThread(
  ctx: Pick<ChiefLineApi, "issues" | "logger">,
  companyId: string,
  threadId: string,
  commentId: string,
  options: { readonly reason?: string; readonly unblock?: boolean } = {},
): Promise<boolean> {
  try {
    if (options.unblock === true) {
      await removeLineBlockers(ctx, companyId, threadId);
    }
    const issue = await ctx.issues.get(threadId, companyId);
    if (issue !== null && parkedStatuses.has(issue.status)) {
      await reopenThread(ctx.issues, threadId, companyId);
    }
    await ctx.issues.requestWakeup(threadId, companyId, {
      reason: options.reason ?? "chief_line",
      idempotencyKey: `chief-line ${commentId}`,
    });
    return true;
  } catch (error) {
    ctx.logger.error("Chief line: couldn't wake the task's agent.", {
      threadId,
      commentId,
      error: (error as Error).message,
    });
    return false;
  }
}

/** Removes every blocked-by link on a line thread, logging the blockers it removed. */
async function removeLineBlockers(
  ctx: Pick<ChiefLineApi, "issues" | "logger">,
  companyId: string,
  threadId: string,
): Promise<void> {
  const { blockedBy } = await ctx.issues.relations.get(threadId, companyId);
  if (blockedBy.length === 0) {
    return;
  }
  await ctx.issues.relations.removeBlockers(
    threadId,
    blockedBy.map((blocker) => blocker.id),
    companyId,
  );
  ctx.logger.info("Chief line: removed blockers from a line thread before waking it.", {
    threadId,
    removed: blockedBy.map((blocker) => blocker.identifier ?? blocker.id),
  });
}

/** Counts one wake against the caller's hourly limit; false when the limit is reached. */
export async function takeSlot(
  ctx: Pick<ChiefLineApi, "state">,
  companyId: string,
  record: "wakes" | "posts",
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

/** An error answer. */
export const fail = (status: number, error: string): PluginApiResponse => ({
  status,
  body: { error },
});

async function send(
  ctx: ChiefLineApi,
  companyId: string,
  settings: ChiefLineSettings,
  body: Records<unknown>,
  now: Date,
): Promise<PluginApiResponse> {
  const { caller, message } = body;
  if (typeof caller !== "string" || !callerPattern.test(caller)) {
    return fail(400, "caller must match ^[a-z0-9][a-z0-9-]{0,40}$.");
  }
  if (typeof message !== "string" || message.trim() === "") {
    return fail(400, "message must be a non-empty string.");
  }
  if (settings.projectId === undefined) {
    return fail(409, "The chief line has no project: set chiefLine.projectId.");
  }
  const target = await resolveTarget(ctx, companyId, caller, body["agent"]);
  if (typeof target === "string") {
    return fail(404, target);
  }
  const thread = await findThread(ctx, companyId, target, settings.projectId);
  if (thread === undefined) {
    return fail(
      404,
      `No line thread for ${caller}: create the task "${targetTitle(target)}" in the chief line's project first.`,
    );
  }
  if (!(await takeSlot(ctx, companyId, "wakes", caller, settings.maxPerHour, now))) {
    return fail(429, `Too many messages: ${caller} may send ${settings.maxPerHour} per hour.`);
  }
  // Posted by the plugin itself (no actorUserId): the run it starts stays on the board's seats.
  const comment = await ctx.issues.createComment(
    thread.id,
    target.agent === undefined
      ? `**From ${caller} (chief line)**\n\n${message}`
      : `**From ${caller} (line)**\n\n${message}`,
    companyId,
  );
  // The comment is posted: from here on the send succeeded, whether or not Chief wakes.
  const woke = await wakeThread(ctx, companyId, thread.id, comment.id, { unblock: true });
  return {
    status: 200,
    body: { threadId: thread.id, identifier: thread.identifier, commentId: comment.id, woke },
  };
}

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
  const target = await resolveTarget(ctx, companyId, caller, body["agent"]);
  if (typeof target === "string") {
    return fail(404, target);
  }
  const assigneeId = target.agent?.id ?? (await chiefAgentId(ctx, companyId));
  if (assigneeId === undefined) {
    return fail(409, "No agent named Chief in this company.");
  }
  const thread = await findOrCreateThread(ctx, companyId, target, settings.projectId, assigneeId);
  return { status: 200, body: { threadId: thread.id, identifier: thread.identifier } };
}

async function readThread(
  ctx: ChiefLineApi,
  companyId: string,
  settings: ChiefLineSettings,
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
  if (settings.projectId === undefined) {
    return fail(409, "The chief line has no project: set chiefLine.projectId.");
  }
  const target = await resolveTarget(ctx, companyId, caller, query["agent"]);
  if (typeof target === "string") {
    return fail(404, target);
  }
  const thread = await findThread(ctx, companyId, target, settings.projectId);
  if (thread === undefined) {
    return fail(404, `No line thread for ${caller} yet.`);
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
  const target = await resolveTarget(ctx, companyId, caller, body["agent"]);
  if (typeof target === "string") {
    return fail(404, target);
  }
  const hooks = await readRecords<string>(ctx, companyId, "hooks");
  const key = targetKey(target);
  await ctx.state.set(chiefLineStateKey(companyId, "hooks"), { ...hooks, [key]: url });
  return { status: 200, body: { caller, agent: targetAgentName(target), subscribed: true } };
}

/** Whether a route key is one of the chief line's. */
export const isChiefLineRoute = (routeKey: string) =>
  (Object.values(chiefLineRouteKeys) as string[]).includes(routeKey);

/** Answers the chief line's routes and `board/post`, for a signed-in board user only. */
export async function handleChiefLineRequest(
  input: PluginApiRequestInput,
  ctx: ChiefLineApi,
  now: Date = new Date(),
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
    case chiefLineRouteKeys.send:
      return await send(ctx, input.companyId, settings, body, now);
    case chiefLineRouteKeys.openThread:
      return await openThread(ctx, input.companyId, settings, body);
    case chiefLineRouteKeys.thread:
      return await readThread(ctx, input.companyId, settings, input.query);
    case chiefLineRouteKeys.boardPost:
      return await boardPost(ctx, input.companyId, settings, body, now);
    default:
      return await subscribe(ctx, input.companyId, settings, body);
  }
}
