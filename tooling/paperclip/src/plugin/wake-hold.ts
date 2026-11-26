import type {
  PluginConfigClient,
  PluginDataClient,
  PluginIssuesClient,
} from "@paperclipai/plugin-sdk";
import { companyConfig } from "./job.ts";
import { defaultHoldSeconds, maxHoldSeconds, minHoldSeconds } from "./wake-hold-declaration.ts";

/**
 * Front bot v2b's data key (HAL-19315, plugin half of HAL-19292; design in
 * HAL-19223's `wake-hold-draft`). Before Paperclip wakes a chat's agent for a
 * person's message, the server's patch asks this key whether to wake now or
 * hold the wake a few seconds, so a burst of messages becomes one run. It
 * gets counts and times only, never message text. It never calls a model or
 * the network: it reads its settings and the task from the host. The server
 * waits at most 300 ms for the answer and never holds a message longer than
 * 15 s, whatever this answers.
 */

/** The data key the server's patch asks. */
export const wakeHoldDataKey = "wake-hold";

/** What the server's patch gets back. */
export type WakeHoldAnswer =
  | { readonly wake: "now"; readonly reason: string }
  | { readonly wake: "after"; readonly seconds: number };

/** The wake-hold part of a company's settings. */
export interface WakeHoldSettings {
  /** Off unless exactly `true`. */
  readonly enabled: boolean;
  /** The hold after the newest message, a whole number of seconds from 1 to 10. */
  readonly seconds: number;
}

/** Reads the settings; a hold that isn't a whole number from 1 to 10 counts as the default. */
export function readWakeHoldSettings(config: Readonly<Record<string, unknown>>): WakeHoldSettings {
  const seconds = config["wakeHoldSeconds"];
  const valid =
    typeof seconds === "number" &&
    Number.isInteger(seconds) &&
    seconds >= minHoldSeconds &&
    seconds <= maxHoldSeconds;
  return {
    enabled: config["wakeHoldEnabled"] === true,
    seconds: valid ? seconds : defaultHoldSeconds,
  };
}

/**
 * The sliding hold: the wake waits until `seconds` have passed since the
 * newest owed message, rounded up to a whole second and at least 1; when that
 * time has already passed, it wakes now.
 */
export function slidingHold(seconds: number, newestOwedAt: Date, now: Date): WakeHoldAnswer {
  const left = seconds - (now.getTime() - newestOwedAt.getTime()) / 1_000;
  if (left <= 0) {
    return { wake: "now", reason: "the hold has passed" };
  }
  return { wake: "after", seconds: Math.max(minHoldSeconds, Math.ceil(left)) };
}

/** The part of the plugin context the data key reads. */
export interface WakeHoldApi {
  readonly config: PluginConfigClient;
  readonly issues: Pick<PluginIssuesClient, "get">;
  readonly data: Pick<PluginDataClient, "register">;
}

/** One request's answer: hold the wake, or wake now and why. */
export async function answerWakeHold(
  ctx: Omit<WakeHoldApi, "data">,
  params: Record<string, unknown>,
  now: () => Date = () => new Date(),
): Promise<WakeHoldAnswer> {
  const { companyId, issueId, newestOwedAt } = params;
  const newest = typeof newestOwedAt === "string" ? new Date(newestOwedAt) : undefined;
  if (
    typeof companyId !== "string" ||
    typeof issueId !== "string" ||
    newest === undefined ||
    Number.isNaN(newest.getTime())
  ) {
    return { wake: "now", reason: "companyId, issueId and newestOwedAt are required" };
  }
  const config = await companyConfig(ctx.config, companyId);
  const settings = config === undefined ? undefined : readWakeHoldSettings(config);
  if (settings?.enabled !== true) {
    return { wake: "now", reason: "setting wakeHoldEnabled is off" };
  }
  const issue = await ctx.issues.get(issueId, companyId);
  if (issue === null || issue.companyId !== companyId || !issue.conversationAgentId) {
    return { wake: "now", reason: "not one of this company's chat tasks" };
  }
  // A message sent during a run already waits for that run; holding it only delays it.
  if (issue.activeRun) {
    return { wake: "now", reason: "a run on the task is live" };
  }
  return slidingHold(settings.seconds, newest, now());
}

/** Registers the data key. */
export function registerWakeHold(ctx: WakeHoldApi): void {
  ctx.data.register(wakeHoldDataKey, (params) => answerWakeHold(ctx, params));
}
