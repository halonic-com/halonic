import type { PluginEvent } from "@paperclipai/plugin-sdk";
import {
  type ChiefLineApi,
  type ChiefLineThread,
  chiefAgentId,
  isLiveThread,
  readRecords,
  rememberThread,
  takeSlot,
  wakeThread,
} from "./chief-line.ts";
import {
  chiefLineStateKey,
  parseThreadTitle,
  readChiefLineSettings,
  webhookAllowed,
} from "./chief-line-settings.ts";
import { findAgent, type LineTarget, targetKey, targetTitle } from "./line-target.ts";

/**
 * What the lines do on `issue.comment.created`: a human's comment on a caller's
 * thread (`[chief-line] <caller>` for Chief, `[line] <caller> → <agent>` for
 * any other agent) wakes the thread's agent (within the caller's hourly
 * limit), and a comment by that agent sends the caller's webhook a signal
 * with the thread, the caller, the agent, the comment id and the time, never the body.
 * One retry on a failed POST, then a log line; it never throws.
 */

/** The chief line's event handler's context: the routes' plus outbound HTTP. */
export interface ChiefLineSignalApi extends ChiefLineApi {
  readonly http: { fetch(url: string, init?: RequestInit): Promise<Response> };
}

/** The signal a caller's webhook gets. */
export interface ChiefLineSignal {
  readonly thread: string;
  readonly caller: string;
  readonly commentId: string;
  readonly at: string;
  /** The name of the agent that replied: `Chief` on a chief line. */
  readonly agent: string;
}

/** Companies whose missing Chief was already logged by this worker, to log it once. */
const missingChiefLogged = new Set<string>();

/** How many signalled comment ids are kept per caller, to send each signal once. */
const keptSignalled = 50;

const bodylessSuccess = /Invalid response status code 20[45]\b/;

/** Whether a fetch error is the SDK failing to rebuild a delivered 204 or 205 answer. */
export const deliveredWithoutBody = (error: unknown) =>
  error instanceof TypeError && bodylessSuccess.test(error.message);

async function postOnce(
  ctx: Pick<ChiefLineSignalApi, "http">,
  url: string,
  signal: ChiefLineSignal,
) {
  try {
    const response = await ctx.http.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signal),
    });
    return response.ok;
  } catch (error) {
    // The SDK's worker rebuilds the host's answer as `new Response(body, …)` with an empty string
    // body, which throws for a body-less 2xx (204, 205) after the POST was delivered.
    return deliveredWithoutBody(error);
  }
}

/** Sends a caller's webhook one signal for a comment, once per comment id; logs a failure, never throws. */
export async function sendSignal(
  ctx: Pick<ChiefLineSignalApi, "state" | "http" | "logger">,
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
    ctx.logger.info("Chief line: over the hourly limit, the agent not woken.", {
      caller,
      commentId,
    });
    return;
  }
  await wakeThread(ctx, companyId, thread.id, commentId, { unblock: true });
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

/** A live line thread with its caller and the id of the agent that answers on it. */
interface FoundLine {
  readonly target: LineTarget;
  readonly thread: ChiefLineThread;
  readonly agentId: string;
  readonly agentName: string;
}

/** The thread's agent: Chief for a chief line, else the agent named in the title. */
async function lineAgent(
  ctx: ChiefLineSignalApi,
  companyId: string,
  agentName: string | undefined,
): Promise<{ id: string; name: string } | undefined> {
  if (agentName === undefined) {
    const chiefId = await chiefAgentId(ctx, companyId);
    if (chiefId === undefined && !missingChiefLogged.has(companyId)) {
      // Without Chief, no author can be told apart from Chief: no wake and no signal.
      missingChiefLogged.add(companyId);
      ctx.logger.error("Chief line: no agent named Chief; comments are ignored.", { companyId });
    }
    return chiefId === undefined ? undefined : { id: chiefId, name: "Chief" };
  }
  const agents = await ctx.agents.list({ companyId, limit: 500 });
  const found = agents.find((agent) => agent.name === agentName) ?? findAgent(agents, agentName);
  return found === undefined ? undefined : { id: found.id, name: found.name };
}

/**
 * The caller, agent and thread of a live line task. The task's own title names the caller and
 * agent, so a stored record can't go stale here.
 */
async function threadOf(
  ctx: ChiefLineSignalApi,
  companyId: string,
  issueId: string,
  projectId: string | undefined,
): Promise<FoundLine | undefined> {
  const issue = await ctx.issues.get(issueId, companyId);
  const parsed = issue === null ? undefined : parseThreadTitle(issue.title);
  if (issue === null || parsed === undefined || projectId === undefined) {
    return undefined;
  }
  const agent = await lineAgent(ctx, companyId, parsed.agentName);
  if (agent === undefined) {
    return undefined;
  }
  const target: LineTarget =
    parsed.agentName === undefined ? { caller: parsed.caller } : { caller: parsed.caller, agent };
  if (!isLiveThread(issue, targetTitle(target), projectId)) {
    return undefined;
  }
  const thread: ChiefLineThread = { id: issue.id, identifier: issue.identifier ?? issue.id };
  await rememberThread(ctx, companyId, targetKey(target), thread);
  return { target, thread, agentId: agent.id, agentName: agent.name };
}

async function handle(ctx: ChiefLineSignalApi, event: PluginEvent): Promise<void> {
  const { companyId } = event;
  const settings = readChiefLineSettings(await ctx.config.get(companyId));
  const { issueId, commentId } = eventIds(event);
  if (!settings.enabled || issueId === undefined) {
    return;
  }
  const found = await threadOf(ctx, companyId, issueId, settings.projectId);
  if (found === undefined) {
    return;
  }
  const { target, thread, agentId, agentName } = found;
  const { caller } = target;
  const comments = await ctx.issues.listComments(thread.id, companyId);
  // Without a comment id in the payload, the newest comment is the one just created.
  const comment =
    commentId === undefined ? comments.at(-1) : comments.find((c) => c.id === commentId);
  if (comment === undefined) {
    return;
  }
  if (comment.authorAgentId !== agentId) {
    // Only a human's comment wakes the agent here. System comments and the plugin's own posts
    // have no author (the send route wakes the agent itself), and another agent's wakes nothing.
    if (comment.authorAgentId === null && comment.authorUserId !== null) {
      await wakeChief(ctx, companyId, caller, thread, comment.id, settings.maxPerHour);
    }
    return;
  }
  const hooks = await readRecords<string>(ctx, companyId, "hooks");
  // A line to another agent may have its own webhook; else the caller's (chief line) one.
  const url = hooks[targetKey(target)] ?? hooks[caller];
  if (url === undefined || !webhookAllowed(url, settings.webhookHosts)) {
    return;
  }
  const at = new Date(comment.createdAt).toISOString();
  await sendSignal(ctx, companyId, url, {
    thread: thread.identifier,
    caller,
    commentId: comment.id,
    at,
    agent: agentName,
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
