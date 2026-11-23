import type {
  PluginConfigClient,
  PluginIssuesClient,
  PluginLogger,
  PluginSecretsClient,
} from "@paperclipai/plugin-sdk";
import type { CompanyLabel } from "../difficulty-tagger/labels.ts";
import {
  parseTaggerAnswer,
  type TaggerAnswer,
  taggerRequest,
} from "../difficulty-tagger/prompt.ts";
import type { ActiveTaggerSettings } from "../difficulty-tagger/settings.ts";
import { callCostMicroUsd, type TaggerUsage } from "../difficulty-tagger/spend.ts";
import type { StateApi } from "../snapshot/store.ts";
import { errorCode } from "./board-check-api.ts";
import type { MetricsApi } from "./metrics.ts";

/**
 * The difficulty tagger's two calls outside the plugin host (HAL-16901): the
 * one to Anthropic's Messages API with the tagger's key, and the label list
 * from Paperclip's API. Neither logs anything, so the keys can't reach a log.
 */

/** The part of the plugin context the tagger uses, so tests can fake it. */
export interface TaggerApi extends MetricsApi, StateApi {
  readonly issues: Pick<PluginIssuesClient, "get" | "update">;
  readonly config: PluginConfigClient;
  readonly secrets: Pick<PluginSecretsClient, "resolve">;
  readonly logger: Pick<PluginLogger, "info" | "error">;
}

/** What the tagger reaches outside the host, so tests can replace it. */
export interface TaggerDeps {
  /** The host's outbound `fetch`, for the one call to Anthropic's Messages API. */
  readonly anthropicFetch: typeof fetch;
  /** Node's own `fetch`, for Paperclip's API on its private address (as in task-effort.ts). */
  readonly paperclipFetch: typeof fetch;
  readonly now: () => Date;
}

const messagesUrl = "https://api.anthropic.com/v1/messages";
const requestTimeoutMs = 15_000;

/** Asks Haiku about one task. Returns its answer (undefined when unreadable) and cost, or an error code. */
export async function askTagger(
  ctx: TaggerApi,
  deps: TaggerDeps,
  settings: ActiveTaggerSettings,
  companyId: string,
  input: string,
): Promise<{ answer: TaggerAnswer | undefined; cost: number } | { failure: string }> {
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
      body: JSON.stringify(taggerRequest(input)),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      return { failure: `http_${response.status}` };
    }
    const body = (await response.json()) as {
      content?: { type?: string; text?: string }[];
      usage?: TaggerUsage;
    };
    const text = (body.content ?? [])
      .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
      .join("");
    return { answer: parseTaggerAnswer(text), cost: callCostMicroUsd(body.usage) };
  } catch (error) {
    return { failure: errorCode(error) };
  }
}

/** The company's labels from Paperclip's API: the plugin SDK has no label reads. */
export async function companyLabels(
  ctx: TaggerApi,
  deps: TaggerDeps,
  settings: ActiveTaggerSettings,
  companyId: string,
): Promise<CompanyLabel[]> {
  const key = await ctx.secrets.resolve(settings.apiKey, { companyId });
  const response = await deps.paperclipFetch(
    `${settings.apiUrl}/api/companies/${encodeURIComponent(companyId)}/labels`,
    { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(requestTimeoutMs) },
  );
  if (!response.ok) {
    throw Object.assign(new Error("labels"), { code: `http_${response.status}` });
  }
  return ((await response.json()) as CompanyLabel[]).map(({ id, name }) => ({ id, name }));
}
