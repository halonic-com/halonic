import type { PluginEvent } from "@paperclipai/plugin-sdk";
import {
  type ChiefLineApi,
  type ChiefLineThread,
  chiefAgentId,
  readRecords,
  takeSlot,
} from "./chief-line.ts";
import { chiefLineStateKey, readChiefLineSettings, webhookAllowed } from "./chief-line-settings.ts";

/**
 * What the chief line does on `issue.comment.created`: a comment on a caller's
 * `[chief-line]` thread by anyone but Chief wakes Chief (within the caller's
 * hourly limit), and a comment by Chief sends the caller's webhook a signal
 * with the thread, the caller, the comment id and the time, never the body.
 * One retry on a failed POST, then a log line; it never throws.
 */

/** The chief line's event handler's context: the routes' plus outbound HTTP and a logger. */
export interface ChiefLineSignalApi extends ChiefLineApi {
  readonly http: { fetch(url: string, init?: RequestInit): Promise<Response> };
  readonly logger: {
    info(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
  };
}

/** The signal a caller's webhook gets. */
export interface ChiefLineSignal {
  readonly thread: string;
  readonly caller: string;
  readonly commentId: string;
  readonly at: string;
}

/** How many signalled comment ids are kept per caller, to send each signal once. */
const keptSignalled = 50;

async function postOnce(ctx: ChiefLineSignalApi, url: string, signal: ChiefLineSignal) {
  try {
    const response = await ctx.http.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signal),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendSignal(
  ctx: ChiefLineSignalApi,
  companyId: string,
  url: string,
  signal: ChiefLineSignal,
): Promise<void> {
  const signalled = await readRecords<string[]>(ctx, companyId, "signalled");
  const sent = signalled[signal.caller] ?? [];
  if (sent.includes(signal.commentId)) {
    return;
  }
  await ctx.state.set(chiefLineStateKey(companyId, "signalled"), {
    ...signalled,
    [signal.caller]: [...sent, signal.commentId].slice(-keptSignalled),
  });
  if ((await postOnce(ctx, url, signal)) || (await postOnce(ctx, url, signal))) {
    return;
  }
  ctx.logger.error("Chief line: the reply signal failed twice.", {
    caller: signal.caller,
    commentId: signal.commentId,
  });
}

async function wakeChief(
  ctx: ChiefLineSignalApi,
  companyId: string,
  caller: string,
  thread: ChiefLineThread,
  commentId: string,
  maxPerHour: number,
) {
  if (!(await takeSlot(ctx, companyId, "wakes", caller, maxPerHour, new Date()))) {
    ctx.logger.info("Chief line: over the hourly limit, Chief not woken.", { caller, commentId });
    return;
  }
  await ctx.issues.requestWakeup(thread.id, companyId, {
    reason: "chief_line",
    idempotencyKey: `chief-line ${commentId}`,
  });
}

/** The comment's thread id and comment id, from the event's payload. */
function eventIds(event: PluginEvent): { issueId?: string; commentId?: string } {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const issueId = typeof payload["issueId"] === "string" ? payload["issueId"] : event.entityId;
  const commentId = typeof payload["commentId"] === "string" ? payload["commentId"] : undefined;
  return {
    ...(issueId === undefined ? {} : { issueId }),
    ...(commentId === undefined ? {} : { commentId }),
  };
}

async function handle(ctx: ChiefLineSignalApi, event: PluginEvent): Promise<void> {
  const { companyId } = event;
  const settings = readChiefLineSettings(await ctx.config.get(companyId));
  const { issueId, commentId } = eventIds(event);
  if (!settings.enabled || issueId === undefined) {
    return;
  }
  const threads = await readRecords<ChiefLineThread>(ctx, companyId, "threads");
  const entry = Object.entries(threads).find(([, thread]) => thread.id === issueId);
  if (entry === undefined) {
    return;
  }
  const [caller, thread] = entry;
  const comments = await ctx.issues.listComments(thread.id, companyId);
  // Without a comment id in the payload, the newest comment is the one just created.
  const comment =
    commentId === undefined ? comments.at(-1) : comments.find((c) => c.id === commentId);
  if (comment === undefined) {
    return;
  }
  const chiefId = await chiefAgentId(ctx, companyId);
  if (comment.authorAgentId === null || comment.authorAgentId !== chiefId) {
    await wakeChief(ctx, companyId, caller, thread, comment.id, settings.maxPerHour);
    return;
  }
  const url = (await readRecords<string>(ctx, companyId, "hooks"))[caller];
  if (url === undefined || !webhookAllowed(url, settings.webhookHosts)) {
    return;
  }
  const at = new Date(comment.createdAt).toISOString();
  await sendSignal(ctx, companyId, url, {
    thread: thread.identifier,
    caller,
    commentId: comment.id,
    at,
  });
}

/** Handles one `issue.comment.created` event for the chief line; logs and never throws. */
export async function onChiefLineComment(
  ctx: ChiefLineSignalApi,
  event: PluginEvent,
): Promise<void> {
  try {
    await handle(ctx, event);
  } catch (error) {
    ctx.logger.error("Chief line: couldn't handle a new comment.", {
      companyId: event.companyId,
      error: (error as Error).name,
    });
  }
}
