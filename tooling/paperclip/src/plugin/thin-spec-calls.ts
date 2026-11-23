import type {
  PluginAgentsClient,
  PluginConfigClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import { callCostMicroUsd, type TaggerUsage } from "../difficulty-tagger/spend.ts";
import type { StateApi } from "../snapshot/store.ts";
import { parseReading, type Reading, readingRequest } from "../thin-spec/reading.ts";
import type { ThinSpecModel } from "../thin-spec/score.ts";
import type { ActiveThinSpecSettings } from "../thin-spec/settings.ts";
import { errorCode } from "./board-check-api.ts";
import type { MetricsApi } from "./metrics.ts";

/**
 * The thin-spec check's calls outside the plugin host (HAL-17076): Haiku's
 * reading through Anthropic's Messages API, and the clarify task and its
 * blocker through Paperclip's API, because the plugin SDK can't create a task
 * or set a blocker. None of them logs, so the keys can't reach a log.
 */

/** The part of the plugin context the check uses, so tests can fake it. */
export interface ThinSpecApi extends MetricsApi, StateApi {
  readonly issues: Pick<PluginIssuesClient, "get">;
  readonly agents: Pick<PluginAgentsClient, "list">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** What the check reaches outside the host, so tests can replace it. */
export interface ThinSpecDeps {
  /** The host's outbound `fetch`, for the call to Anthropic's Messages API. */
  readonly anthropicFetch: typeof fetch;
  /** Node's own `fetch`, for Paperclip's API on its private address (as in task-effort.ts). */
  readonly paperclipFetch: typeof fetch;
  readonly now: () => Date;
  /** The fitted model (src/thin-spec/model.ts); none keeps the check off. */
  readonly model: ThinSpecModel | undefined;
}

const messagesUrl = "https://api.anthropic.com/v1/messages";
const requestTimeoutMs = 15_000;

/** A call that failed, with an error code safe to log. */
export interface Failed {
  readonly failure: string;
}

/** Asks Haiku for its reading of one task: the reading (undefined when unreadable) and what it cost. */
export async function askReading(
  ctx: ThinSpecApi,
  deps: ThinSpecDeps,
  settings: ActiveThinSpecSettings,
  companyId: string,
  text: string,
): Promise<{ reading: Reading | undefined; cost: number } | Failed> {
  try {
    // Read at call time, sent only to Anthropic, never logged or kept (the SDK's secrets rule).
    const key = await ctx.secrets.resolve(settings.anthropicKey, { companyId });
    const response = await deps.anthropicFetch(messagesUrl, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(readingRequest(text)),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      return { failure: `http_${response.status}` };
    }
    const body = (await response.json()) as {
      content?: { type?: string; text?: string }[];
      usage?: TaggerUsage;
    };
    const answer = (body.content ?? [])
      .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
      .join("");
    return { reading: parseReading(answer), cost: callCostMicroUsd(body.usage) };
  } catch (error) {
    return { failure: errorCode(error) };
  }
}

/** One request to Paperclip's API with the check's key; the answer's JSON, or an error code. */
async function paperclip(
  ctx: ThinSpecApi,
  deps: ThinSpecDeps,
  settings: ActiveThinSpecSettings,
  companyId: string,
  request: {
    readonly method: "GET" | "POST" | "PATCH";
    readonly path: string;
    readonly body?: unknown;
  },
): Promise<unknown> {
  const key = await ctx.secrets.resolve(settings.apiKey, { companyId });
  const response = await deps.paperclipFetch(`${settings.apiUrl}${request.path}`, {
    method: request.method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw Object.assign(new Error("paperclip"), { code: `http_${response.status}` });
  }
  return await response.json();
}

/** The clarify task to create under a flagged task. */
export interface ClarifyTask {
  readonly parentId: string;
  readonly title: string;
  readonly description: string;
  readonly assigneeAgentId: string;
  /** The writer's project and goal, so the clarifier gets the same repo to read. */
  readonly projectId?: string;
  readonly goalId?: string;
}

/** The writer's task statuses before a run starts on it. */
const waitingStatuses = new Set(["backlog", "todo"]);

/**
 * Reads the writer's task first: if a run already started on it, adds nothing
 * (`writer_started`), so a check that finishes late never blocks a run in
 * progress. Otherwise creates the clarify task, then blocks the writer's task
 * on it, keeping the blockers it had. Returns the clarify task's id, or why it
 * didn't add one.
 */
export async function addClarifyStep(
  ctx: ThinSpecApi,
  deps: ThinSpecDeps,
  settings: ActiveThinSpecSettings,
  companyId: string,
  task: ClarifyTask,
): Promise<{ clarifyId: string } | { skipped: "writer_started" } | Failed> {
  try {
    const parentPath = `/api/issues/${encodeURIComponent(task.parentId)}`;
    const parent = (await paperclip(ctx, deps, settings, companyId, {
      method: "GET",
      path: parentPath,
    })) as { status?: unknown; blockedBy?: { id?: unknown }[] };
    if (typeof parent.status !== "string" || !waitingStatuses.has(parent.status)) {
      return { skipped: "writer_started" };
    }
    const company = encodeURIComponent(companyId);
    const created = (await paperclip(ctx, deps, settings, companyId, {
      method: "POST",
      path: `/api/companies/${company}/issues`,
      body: { ...task, status: "todo" },
    })) as { id?: unknown };
    if (typeof created.id !== "string") {
      return { failure: "no_task_id" };
    }
    const blockers = (parent.blockedBy ?? []).flatMap((issue) =>
      typeof issue.id === "string" ? [issue.id] : [],
    );
    await paperclip(ctx, deps, settings, companyId, {
      method: "PATCH",
      path: parentPath,
      body: { status: "blocked", blockedByIssueIds: [...blockers, created.id] },
    });
    return { clarifyId: created.id };
  } catch (error) {
    return { failure: errorCode(error) };
  }
}
