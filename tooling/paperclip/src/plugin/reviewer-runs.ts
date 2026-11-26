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
 */

/** How many of a reviewer's newest runs to read: enough to see a stop and what came after. */
export const runsRead = 20;

/** The fetch the reader uses: the plugin host's, with a timeout. */
export type RunsFetch = (
  url: string,
  init: { readonly method: "GET"; readonly headers: Record<string, string> },
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

async function readRuns(deps: ReviewerRunsDeps, agentId: string): Promise<RunRow[]> {
  const key = await deps.resolve(deps.apiKey);
  const query = `agentId=${encodeURIComponent(agentId)}&limit=${runsRead}`;
  const response = await deps.fetch(
    `${deps.apiUrl}/api/companies/${encodeURIComponent(deps.companyId)}/heartbeat-runs?${query}`,
    { method: "GET", headers: { authorization: `Bearer ${key}` } },
  );
  if (!response.ok) {
    throw new Error(`Paperclip answered ${response.status}`);
  }
  const body = await response.json();
  if (!Array.isArray(body)) {
    throw new Error("Paperclip's answer isn't a list of runs");
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
        deps.log(`PR watcher: couldn't read ${agentId}'s runs: ${(error as Error).message}`);
        return "unknown" as const;
      },
    );
    known.set(agentId, read);
    return read;
  };
}

/** The part of the plugin context the reader uses. */
export interface ReviewerRunsApi {
  readonly http: { fetch(url: string, init?: RequestInit): Promise<Response> };
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
    fetch: (url, init) =>
      ctx.http.fetch(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
    resolve: (ref) => ctx.secrets.resolve(ref, { companyId: pass.companyId }),
  });
}
