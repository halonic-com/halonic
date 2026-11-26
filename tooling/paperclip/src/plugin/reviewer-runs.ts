import {
  type Limit,
  limitOf,
  type ReviewerLimits,
  type RunRow,
} from "../pr-watcher/reviewer-limits.ts";
import { readTaskEffortSettings, type SecretRef } from "../task-effort/settings.ts";
import { requestTimeoutMs } from "./job.ts";

/**
 * Reads a reviewer's newest runs from Paperclip's own API for the
 * limit-aware review route (HAL-19203). The plugin SDK's task reads show
 * only a task's working run, not one parked on a pool wait or a limit stop,
 * so this GETs `heartbeat-runs` with the Paperclip API address and key the
 * task effort handler already uses. GET only, at most once per reviewer and
 * pass, and only when a reviewer's task waits for approval.
 *
 * It uses Node's own `fetch`, like the plugin's other calls to Paperclip's
 * API: the host's `ctx.http.fetch` may refuse Paperclip's private address,
 * and it forwards neither the timeout's signal nor `redirect`. Errors carry
 * only a fixed code, so nothing from the answer reaches the log.
 */

/** How many of a reviewer's newest runs to read: enough to see a stop and what came after. */
export const runsRead = 20;

/** The fetch the reader uses: Node's own, only ever called with the settings' Paperclip url. */
export type RunsFetch = (
  url: string,
  init: {
    readonly method: "GET";
    readonly headers: Record<string, string>;
    readonly redirect: "error";
    readonly signal: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

/** What the reader needs. */
export interface ReviewerRunsDeps {
  readonly fetch: RunsFetch;
  /** Paperclip's API, scheme, host and port only. */
  readonly apiUrl: string;
  readonly apiKey: SecretRef;
  /** Reads a secret at run time; never logged or kept. */
  readonly resolve: (ref: SecretRef) => Promise<string>;
  readonly companyId: string;
  readonly now: Date;
  readonly log: (line: string) => void;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** One run as the API returns it, with only the fields the rules read; null when it isn't one. */
export function runRow(value: unknown): RunRow | null {
  const run = value as Record<string, unknown> | null;
  const status = text(run?.["status"]);
  const createdAt = text(run?.["createdAt"]);
  if (status === null || createdAt === null) {
    return null;
  }
  return {
    status,
    createdAt,
    scheduledRetryReason: text(run?.["scheduledRetryReason"]),
    errorCode: text(run?.["errorCode"]),
    error: text(run?.["error"]),
    startedAt: text(run?.["startedAt"]),
    finishedAt: text(run?.["finishedAt"]),
  };
}

/** A failed read's fixed code: `http_<status>`, `not_a_list` or the error's name, never its message. */
function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") {
    return code;
  }
  return error instanceof Error ? error.name : "unknown_error";
}

async function readRuns(deps: ReviewerRunsDeps, agentId: string): Promise<RunRow[]> {
  const key = await deps.resolve(deps.apiKey);
  const query = `agentId=${encodeURIComponent(agentId)}&limit=${runsRead}`;
  const response = await deps.fetch(
    `${deps.apiUrl}/api/companies/${encodeURIComponent(deps.companyId)}/heartbeat-runs?${query}`,
    {
      method: "GET",
      headers: { authorization: `Bearer ${key}` },
      // A redirect would take the key header to another host.
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    },
  );
  if (!response.ok) {
    throw Object.assign(new Error("paperclip"), { code: `http_${response.status}` });
  }
  const body = await response.json();
  if (!Array.isArray(body)) {
    throw Object.assign(new Error("paperclip"), { code: "not_a_list" });
  }
  return body.flatMap((value) => runRow(value) ?? []);
}

/**
 * Each reviewer's limit, read once per pass. A read that fails is logged and
 * answers `unknown`, so nothing moves on a guess.
 */
export function paperclipReviewerLimits(deps: ReviewerRunsDeps): ReviewerLimits {
  const known = new Map<string, Promise<Limit | undefined | "unknown">>();
  return (agentId) => {
    const cached = known.get(agentId);
    if (cached !== undefined) {
      return cached;
    }
    const read = readRuns(deps, agentId).then(
      (runs) => limitOf(runs, deps.now),
      (error: unknown) => {
        deps.log(`PR watcher: couldn't read ${agentId}'s runs: ${failureCode(error)}`);
        return "unknown" as const;
      },
    );
    known.set(agentId, read);
    return read;
  };
}

/** The part of the plugin context the reader uses. */
export interface ReviewerRunsApi {
  readonly secrets: {
    resolve(ref: SecretRef, scope: { readonly companyId: string }): Promise<string>;
  };
}

/**
 * The reader for a company, or undefined when its settings name no Paperclip
 * API address or key: then no review moves, and the pass says so once.
 */
export function reviewerLimitsOf(
  ctx: ReviewerRunsApi,
  paperclipFetch: RunsFetch,
  config: Readonly<Record<string, unknown>> | undefined,
  pass: { readonly companyId: string; readonly now: Date; readonly log: (line: string) => void },
): ReviewerLimits | undefined {
  const { apiUrl, apiKey } = readTaskEffortSettings(config ?? {});
  if (apiUrl === undefined || apiKey === undefined) {
    pass.log(
      "PR watcher: no Paperclip API address or key set, so no review moves off a limited reviewer.",
    );
    return undefined;
  }
  return paperclipReviewerLimits({
    ...pass,
    apiUrl,
    apiKey,
    fetch: paperclipFetch,
    resolve: (ref) => ctx.secrets.resolve(ref, { companyId: pass.companyId }),
  });
}
