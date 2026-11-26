import type { PluginSecretsClient } from "@paperclipai/plugin-sdk";
import type { ActiveNotesSettings } from "../front-bot/settings.ts";

/**
 * The progress notes' two reads of Paperclip's API (HAL-19218): a run's status
 * and the next piece of its log. The plugin SDK has neither, so they go to
 * Paperclip's own API with the plugin's key, like the task effort handler's
 * writes. Errors carry only a fixed code; the log's text is returned to the
 * caller in memory and never logged or kept here.
 */

/** Node's own `fetch`, only ever called with the settings' Paperclip url. */
export type PaperclipFetch = typeof fetch;

/** How long one read may take before the note gives up on it. */
const readTimeoutMs = 8_000;

/** How much of the log one read takes. A longer line (a big tool output) is skipped, never parsed in part. */
export const logReadBytes = 64 * 1024;

/** Paperclip's run ids are UUIDs; anything else is never put in a url. */
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a run id may be read. */
export function readableRunId(runId: string | undefined): runId is string {
  return runId !== undefined && runIdPattern.test(runId);
}

interface RunsApi {
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
}

/** One GET with the plugin's key; the answer's JSON, or a thrown error with a fixed code. */
async function get(
  ctx: RunsApi,
  paperclipFetch: PaperclipFetch,
  settings: ActiveNotesSettings,
  companyId: string,
  path: string,
): Promise<unknown> {
  const key = await ctx.secrets.resolve(settings.apiKey, { companyId });
  const response = await paperclipFetch(`${settings.apiUrl}${path}`, {
    headers: { authorization: `Bearer ${key}` },
    // A redirect would take the key header to another host.
    redirect: "error",
    signal: AbortSignal.timeout(readTimeoutMs),
  });
  if (!response.ok) {
    throw Object.assign(new Error("paperclip"), { code: `http_${response.status}` });
  }
  return await response.json();
}

/** Whether the run is still queued or running: only then can a note still help. */
export async function runIsLive(
  ctx: RunsApi,
  paperclipFetch: PaperclipFetch,
  settings: ActiveNotesSettings,
  companyId: string,
  runId: string,
): Promise<boolean> {
  const run = (await get(
    ctx,
    paperclipFetch,
    settings,
    companyId,
    `/api/heartbeat-runs/${runId}`,
  )) as {
    status?: unknown;
  };
  return run.status === "queued" || run.status === "running";
}

/** One piece of a run's log, from a byte offset. */
export interface LogPiece {
  readonly content: string;
  /** Whether the read took its whole limit, so a line without an end is too long to read whole. */
  readonly full: boolean;
}

/** Reads the run's log from `offset`, at most {@link logReadBytes}. */
export async function readLogPiece(
  ctx: RunsApi,
  paperclipFetch: PaperclipFetch,
  settings: ActiveNotesSettings,
  companyId: string,
  runId: string,
  offset: number,
): Promise<LogPiece> {
  const path = `/api/heartbeat-runs/${runId}/log?offset=${offset}&limitBytes=${logReadBytes}`;
  const answer = (await get(ctx, paperclipFetch, settings, companyId, path)) as {
    content?: unknown;
  };
  const content = typeof answer.content === "string" ? answer.content : "";
  return { content, full: Buffer.byteLength(content, "utf8") >= logReadBytes };
}
