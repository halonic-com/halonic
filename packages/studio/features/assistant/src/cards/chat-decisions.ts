import type { ReviewCard, ReviewStep } from "@halonicjs/app";
import type { AssistantHost } from "../api.ts";
import { changeCount } from "./card-facts.ts";
import { cardReviewsOf } from "./card-reviews.ts";

/** What the strip's Accept all or Reject all did, for its toast and its Undo. */
export interface ChatDecision {
  /** The changes decided and the items they were in; an item waiting on Compare isn't one. */
  readonly changes: number;
  readonly items: number;
  /** The names of the items left out because they wait for Compare (flow-assistant 3.4). */
  readonly waiting: readonly string[];
  readonly step: ReviewStep;
  /** The decided files' cards, so Undo can take their notes back. */
  readonly cards: readonly ReviewCard[];
}

/** The files with changes to review from the chat, one per item: the strip's count. */
export async function itemsToReviewIn(host: AssistantHost, chatId: string): Promise<number> {
  const items = await host.itemsToReview(chatId);
  return new Set(items.map((item) => item.path)).size;
}

/**
 * Accepts or rejects every change to review from the chat, whatever turn made it, as one step
 * (`assistant.chat.apply-all`). The host leaves out a file that changed outside Halonic: it
 * waits for Compare, and the result names it. Each decided file leaves its card's note for the
 * model, as the card's own buttons do (flow-assistant 3.3).
 */
export async function decideChat(
  host: AssistantHost,
  chatId: string,
  decision: "accept" | "reject",
): Promise<ChatDecision> {
  const items = await host.itemsToReview(chatId);
  const paths = [...new Set(items.map((item) => item.path))];
  const counts = new Map(
    await Promise.all(
      paths.map(async (path) => {
        const review = await host.changesIn(path);
        return [path, review === null ? 0 : changeCount(review)] as const;
      }),
    ),
  );
  const target = { kind: "chat", chatId } as const;
  const outcome = decision === "accept" ? await host.accept(target) : await host.reject(target);
  const step = outcome.status === "done" ? outcome.step : { files: [] };
  const decidedPaths = new Set(step.files.map((file) => file.path));
  const cards = cardReviewsOf(host);
  const decided = items.filter((item) => decidedPaths.has(item.path));
  for (const item of decided) cards.leaveNote(item.card, item.path, decision);
  const held = outcome.status === "done" ? new Set(outcome.held) : new Set<string>();
  const waiting = paths.filter((path) => held.has(path)).map((path) => cards.nameOf(chatId, path));
  const decidedFiles = paths.filter((path) => decidedPaths.has(path));
  return {
    changes: decidedFiles.reduce((sum, path) => sum + (counts.get(path) ?? 0), 0),
    items: decidedFiles.length,
    waiting,
    step,
    cards: decided.map((item) => item.card),
  };
}

/** Takes the strip's decision back, for its toast's **Undo**: the changes are back to review. */
export async function undoChatDecision(host: AssistantHost, done: ChatDecision): Promise<void> {
  await host.undo(done.step);
  const cards = cardReviewsOf(host);
  for (const card of done.cards) cards.dropNote(card);
}
