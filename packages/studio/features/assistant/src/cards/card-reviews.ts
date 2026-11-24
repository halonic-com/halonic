import type { FileReview, ReviewStep } from "@halonicjs/app";
import type { AssistantHost } from "../api.ts";
import {
  type CardEnd,
  type CardStep,
  endOfSteps,
  lastStep,
  noteOf,
  stepBetween,
  stepsUpTo,
} from "./card-ends.ts";
import { type CardFacts, changeCount, factsOf } from "./card-facts.ts";

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
      /** The file changed outside Halonic, so Accept all and Reject all wait for Compare. */
      readonly held: boolean;
      /** A decision found the parts out of date, so they were read again (review panel note 1). */
      readonly latest: boolean;
    }
  /**
   * Nothing of the card is left to review. `end` is unknown for a card decided before Studio
   * started, unless its file is just as the model wrote it.
   */
  | {
      readonly kind: "decided";
      readonly facts: CardFacts;
      readonly end: CardEnd | undefined;
      /** The changes as first seen, for the diff an accepted card keeps. */
      readonly first: FileReview | undefined;
    }
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
  /** The changes as first and last seen to review, in this session. */
  first: FileReview | undefined;
  last: FileReview | undefined;
  /** The decisions on its changes so far, oldest first. */
  steps: CardStep[];
  held: boolean;
  latest: boolean;
  /** The decision on the card itself being read now: it is what happened, not a guess from the file. */
  deciding: CardStep["decision"] | undefined;
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
    const kept = this.#keep(proposal);
    kept.held = outcome.status === "done" && outcome.held.includes(proposal.path);
    // Review panel note 1: out-of-date parts are read again quietly, without an error.
    kept.latest = outcome.status === "stale";
    kept.deciding = decision;
    await this.#read(keyOf(proposal)).finally(() => {
      kept.deciding = undefined;
    });
    if (outcome.status !== "done" || outcome.step.files.length === 0) return undefined;
    return { count: state.left, name: state.facts.name, step: outcome.step };
  }

  /** Takes a decision back, for the toast's **Undo**: the changes are back to review. */
  async undo(proposal: Proposal, step: ReviewStep): Promise<void> {
    await this.#host.undo(step);
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
      kept = {
        proposal,
        state: { kind: "reading", facts },
        total: 0,
        watched: false,
        first: undefined,
        last: undefined,
        steps: [],
        held: false,
        latest: false,
        deciding: undefined,
      };
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
      const review = reviews.find((each) => each.path === path);
      if (review !== undefined) this.#open(kept, review);
      // An end stays: an accepted card is still Accepted when the model changes the file again.
      else if (kept.state.kind !== "decided") this.#end(kept, await this.#endOf(kept));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#change(kept, { kind: "failed", facts: kept.state.facts, reason });
    }
  }

  #open(kept: Kept, review: FileReview): void {
    const left = changeCount(review);
    const { last } = kept;
    if (last !== undefined && kept.state.kind === "open" && left < kept.state.left) {
      const count = kept.state.left - left;
      const { deciding } = kept;
      kept.steps.push(
        deciding === undefined ? stepBetween(last, review, count) : { decision: deciding, count },
      );
    }
    kept.total = Math.max(kept.total, left);
    // Changes back to review after an Undo take back the newest steps.
    kept.steps = stepsUpTo(kept.steps, kept.total - left);
    if (kept.state.kind === "decided")
      this.#notesOf(kept.proposal.chatId).delete(kept.proposal.callId);
    kept.first ??= review;
    kept.last = review;
    const facts = factsOf(kept.proposal.path, kept.proposal.content, review);
    const { held, latest, total } = kept;
    this.#change(kept, { kind: "open", facts, review, left, total, held, latest });
  }

  /** Why nothing of the card is left to review: a newer card, Compare, or the decisions on it. */
  async #endOf(kept: Kept): Promise<CardEnd | undefined> {
    const { chatId, path, content } = kept.proposal;
    const { last } = kept;
    if (last === undefined) {
      // Decided before Studio started: only a file just as the model wrote it says how.
      return (await this.#host.savedText(path)) === content ? { kind: "accepted" } : undefined;
    }
    const newer = await this.#host.changesIn(path);
    if (newer !== null) {
      return { kind: "replaced", by: newer.card, sameChat: newer.card.chatId === chatId };
    }
    if (kept.held) return { kind: "replaced-outside" };
    const left = kept.state.kind === "open" ? kept.state.left : changeCount(last);
    const { deciding } = kept;
    kept.steps.push(
      deciding === undefined
        ? lastStep(last, await this.#host.savedText(path), left)
        : { decision: deciding, count: left },
    );
    return endOfSteps(kept.steps);
  }

  #end(kept: Kept, end: CardEnd | undefined): void {
    const note =
      end === undefined || kept.last === undefined ? undefined : noteOf(end, kept.proposal.path);
    if (note !== undefined) this.#notesOf(kept.proposal.chatId).set(kept.proposal.callId, note);
    this.#change(kept, { kind: "decided", facts: kept.state.facts, end, first: kept.first });
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
