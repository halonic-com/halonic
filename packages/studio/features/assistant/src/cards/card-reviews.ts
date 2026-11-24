import type { FileReview, ReviewStep } from "@halonicjs/app";
import type { AssistantHost } from "../api.ts";
import { type CardFacts, changeCount, factsOf } from "./card-facts.ts";
import { notesToTheModel } from "./card-words.ts";

/** The write a card shows: a `propose_file` (with its text) or a `propose_delete` (`null`). */
export interface Proposal {
  readonly chatId: string;
  /** The tool call's id, which is the card's id in the review records. */
  readonly callId: string;
  readonly path: string;
  readonly content: string | null;
}

/** Where a card's changes to review stand. */
export type CardReview =
  | { readonly kind: "reading"; readonly facts: CardFacts }
  | {
      readonly kind: "open";
      readonly facts: CardFacts;
      readonly review: FileReview;
      /** Changes still to review, and how many the card had when first seen. */
      readonly left: number;
      readonly total: number;
    }
  /** Nothing of the card is left to review; its state line comes with T14 PR 8b. */
  | { readonly kind: "decided"; readonly facts: CardFacts }
  | { readonly kind: "failed"; readonly facts: CardFacts; readonly reason: string };

/** What a decision on a card did, for its toast and its Undo. */
export interface CardDecision {
  readonly count: number;
  readonly name: string;
  readonly step: ReviewStep;
}

interface Kept {
  readonly proposal: Proposal;
  state: CardReview;
  total: number;
  /** Its first read has started; later ones follow the changes. */
  watched: boolean;
}

/**
 * The proposal cards of one workspace's chats: each card's changes to review, read again whenever
 * the changes in its file change, wherever they were decided. A decision on a card leaves a note
 * for the model, which goes with the person's next message (flow-assistant 3.3).
 */
export class CardReviews {
  readonly #host: AssistantHost;
  readonly #cards = new Map<string, Kept>();
  /** By chat, then by card: the newest decision on each card. */
  readonly #notes = new Map<string, Map<string, string>>();
  readonly #listeners = new Set<() => void>();

  constructor(host: AssistantHost) {
    this.#host = host;
    host.onDidChange((change) => {
      if (change.kind !== "review") return;
      for (const [key, kept] of this.#cards) {
        if (change.paths.includes(kept.proposal.path)) void this.#read(key);
      }
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** The card's state; the same object until it changes. */
  stateOf(proposal: Proposal): CardReview {
    return this.#keep(proposal).state;
  }

  /** Reads the card's changes to review once; later changes are read as they happen. */
  watch(proposal: Proposal): void {
    const kept = this.#keep(proposal);
    if (kept.watched) return;
    kept.watched = true;
    void this.#read(keyOf(proposal));
  }

  /**
   * Accepts or rejects what is left of the card as one step (`assistant.build.apply-proposal`,
   * `.reject-proposal`). `undefined` when nothing was left or nothing changed.
   */
  async decide(
    proposal: Proposal,
    decision: "accept" | "reject",
  ): Promise<CardDecision | undefined> {
    const state = this.stateOf(proposal);
    if (state.kind !== "open") return undefined;
    const target = {
      kind: "card",
      card: { chatId: proposal.chatId, cardId: proposal.callId },
    } as const;
    const outcome =
      decision === "accept" ? await this.#host.accept(target) : await this.#host.reject(target);
    await this.#read(keyOf(proposal));
    if (outcome.status !== "done" || outcome.step.files.length === 0) return undefined;
    const note =
      decision === "accept"
        ? notesToTheModel.accepted(proposal.path)
        : notesToTheModel.rejected(proposal.path);
    this.#notesOf(proposal.chatId).set(proposal.callId, note);
    return { count: state.left, name: state.facts.name, step: outcome.step };
  }

  /** Takes a decision back, for the toast's **Undo**: the changes are back to review. */
  async undo(proposal: Proposal, step: ReviewStep): Promise<void> {
    await this.#host.undo(step);
    this.#notesOf(proposal.chatId).delete(proposal.callId);
    await this.#read(keyOf(proposal));
  }

  /** The notes for the model since the chat's last message; taking them clears them. */
  takeNotes(chatId: string): readonly string[] {
    const notes = [...(this.#notes.get(chatId)?.values() ?? [])];
    this.#notes.delete(chatId);
    return notes;
  }

  #keep(proposal: Proposal): Kept {
    const key = keyOf(proposal);
    let kept = this.#cards.get(key);
    if (kept === undefined) {
      const facts = factsOf(proposal.path, proposal.content);
      kept = { proposal, state: { kind: "reading", facts }, total: 0, watched: false };
      this.#cards.set(key, kept);
    }
    return kept;
  }

  async #read(key: string): Promise<void> {
    const kept = this.#cards.get(key);
    if (kept === undefined) return;
    const { chatId, callId, path } = kept.proposal;
    try {
      const reviews = await this.#host.changesForCard({ chatId, cardId: callId });
      this.#set(
        kept,
        reviews.find((each) => each.path === path),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#change(kept, { kind: "failed", facts: kept.state.facts, reason });
    }
  }

  #set(kept: Kept, review: FileReview | undefined): void {
    if (review === undefined) {
      this.#change(kept, { kind: "decided", facts: kept.state.facts });
      return;
    }
    const left = changeCount(review);
    kept.total = Math.max(kept.total, left);
    const facts = factsOf(kept.proposal.path, kept.proposal.content, review);
    this.#change(kept, { kind: "open", facts, review, left, total: kept.total });
  }

  #change(kept: Kept, state: CardReview): void {
    kept.state = state;
    for (const listener of this.#listeners) listener();
  }

  #notesOf(chatId: string): Map<string, string> {
    let notes = this.#notes.get(chatId);
    if (notes === undefined) {
      notes = new Map();
      this.#notes.set(chatId, notes);
    }
    return notes;
  }
}

function keyOf(proposal: Proposal): string {
  return `${proposal.chatId}\n${proposal.callId}`;
}

const reviewsOfHost = new WeakMap<AssistantHost, CardReviews>();

/** The proposal cards of the workspace `host` belongs to, one for the whole session. */
export function cardReviewsOf(host: AssistantHost): CardReviews {
  let reviews = reviewsOfHost.get(host);
  if (reviews === undefined) {
    reviews = new CardReviews(host);
    reviewsOfHost.set(host, reviews);
  }
  return reviews;
}
