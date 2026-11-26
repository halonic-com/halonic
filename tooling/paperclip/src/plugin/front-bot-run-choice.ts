import type { PluginConfigClient, PluginDataClient } from "@paperclipai/plugin-sdk";
import { matchChoice, type RunChoice, type StoredRunChoice } from "../front-bot/run-choice.ts";
import { readFrontBotSettings } from "../front-bot/settings.ts";
import type { StateApi } from "../snapshot/store.ts";
import { companyConfig } from "./job.ts";

/**
 * Front bot v2's data key (HAL-19219, design on HAL-18847 section 2.3). The
 * first-reply call stores its run choice per chat task; the server's patch
 * asks this key just before a chat message's run starts, and gives the run
 * the choice it gets. This only reads: it never calls a model. A message the
 * bot is still working on is waited for, but never longer than
 * {@link pendingWaitMs}, which stays under the server's own 1.5 s limit.
 */

/** The data key the server's patch asks. */
export const runChoiceDataKey = "front-bot-run-choice";

/** How long an answer waits for a message the bot hasn't finished yet. */
export const pendingWaitMs = 1_200;

/** What the server's patch gets back. */
export interface RunChoiceAnswer {
  readonly choice: RunChoice | null;
  readonly reason?: string;
}

function choiceKey(issueId: string) {
  return {
    scopeKind: "issue",
    scopeId: issueId,
    namespace: "front-bot",
    stateKey: "run-choice",
  } as const;
}

/** Keeps the newest message's choice for its chat task. */
export async function storeRunChoice(
  state: StateApi["state"],
  issueId: string,
  stored: StoredRunChoice,
): Promise<void> {
  await state.set(choiceKey(issueId), stored);
}

/**
 * The messages the bot has heard but not finished, so an answer can wait for
 * one instead of telling the run "no choice" a few hundred milliseconds early.
 */
export function pendingMessages() {
  const pending = new Map<string, Promise<void>>();
  return {
    /** Marks a message as being worked on until `done` settles. */
    track(commentId: string, done: Promise<void>): void {
      const settled = done.finally(() => {
        if (pending.get(commentId) === settled) pending.delete(commentId);
      });
      pending.set(commentId, settled);
    },
    /** Waits for the message, if the bot is still on it, at most `ms`. */
    async waitFor(commentId: string, ms: number): Promise<void> {
      const work = pending.get(commentId);
      if (work === undefined) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });
      try {
        await Promise.race([work.catch(() => undefined), limit]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type PendingMessages = ReturnType<typeof pendingMessages>;

/** The part of the plugin context the data key reads. */
export interface RunChoiceApi extends StateApi {
  readonly config: PluginConfigClient;
  readonly data: Pick<PluginDataClient, "register">;
}

/** One request's answer: the stored choice for this message, or why there is none. */
export async function answerRunChoice(
  ctx: Omit<RunChoiceApi, "data">,
  pending: PendingMessages,
  params: Record<string, unknown>,
  now: () => Date = () => new Date(),
): Promise<RunChoiceAnswer> {
  const { companyId, issueId, commentId } = params;
  if (
    typeof companyId !== "string" ||
    typeof issueId !== "string" ||
    typeof commentId !== "string"
  ) {
    return { choice: null, reason: "companyId, issueId and commentId are required" };
  }
  const config = await companyConfig(ctx.config, companyId);
  const settings = config === undefined ? undefined : readFrontBotSettings(config);
  if (settings?.enabled !== true || !settings.runChoice) {
    return { choice: null, reason: "setting frontBotRunChoice is off" };
  }
  await pending.waitFor(commentId, pendingWaitMs);
  const stored = (await ctx.state.get(choiceKey(issueId))) as StoredRunChoice | null;
  return matchChoice(stored, commentId, now());
}

/** Registers the data key. */
export function registerRunChoice(ctx: RunChoiceApi, pending: PendingMessages): void {
  ctx.data.register(runChoiceDataKey, (params) => answerRunChoice(ctx, pending, params));
}
