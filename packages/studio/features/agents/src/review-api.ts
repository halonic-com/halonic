/**
 * The assistant's changes to review in an agent's file, as the agent page's item bar and marks
 * read and decide them (AI changes 1.2, T14 PR 14a). The app provides it over its review service;
 * where it doesn't, the page finds no service and shows no bar.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";
import type { AgentRef } from "./api.ts";

/** One change the assistant made to an agent: one field, or one agent step. */
export interface AgentChangeToReview {
  /** Stable within one reading, such as `field:model` or `method:draft-reply`. */
  readonly id: string;
  /** What changed, such as "Model: small → large". */
  readonly sentence: string;
  /** Listed as Important: what the agent is told, may use and reach, and its sandbox. */
  readonly important: boolean;
  /**
   * The places in the file the change covers, such as `["model"]` or `["methods", "draft-reply"]`,
   * so the page puts its mark at that field. Empty for a change that covers the whole file.
   */
  readonly parts: readonly (readonly string[])[];
  /**
   * The value at the first part before the assistant changed it, for the mark's old value; absent
   * when the field wasn't in the file then.
   */
  readonly before?: { readonly value: unknown } | undefined;
}

/** The assistant's changes to review in one agent's file, as last read. */
export interface AgentReview {
  /** The agent's file, from the workspace folder. */
  readonly path: string;
  /**
   * The changes can only be accepted or rejected together, as one: the assistant created the file
   * (Reject then deletes it), deleted it, changed only its comments or spacing, or it can't be
   * read as an agent before or after. `changes` then holds one change, "New", "Deleted" or
   * "Changed", with no parts.
   */
  readonly whole: boolean;
  /** In the order of the agent's fields, then its agent steps. */
  readonly changes: readonly AgentChangeToReview[];
  /**
   * Names the texts the changes were worked out from. A decision on a change passes it back, so a
   * click on a review that is out of date decides nothing and answers `stale`.
   */
  readonly seen: string;
}

/**
 * What one Accept or Reject did.
 *
 * - `done`: decided; `undo` puts it back as it was (`held` when the file changed since).
 * - `held`: the file changed outside Halonic since Halonic last saw it, so nothing was decided; it
 *   waits for **Compare** (review panel note 4).
 * - `stale`: the review was read before the file changed; nothing was decided. Read it again
 *   quietly and show the new one (note 1).
 * - `cant-separate`: this change can't be decided apart from the rest of the file; offer the file.
 */
export type AgentReviewDecision =
  | { readonly status: "done"; readonly undo: () => Promise<"done" | "held"> }
  | { readonly status: "held" }
  | { readonly status: "stale" }
  | { readonly status: "cant-separate" };

/** What a decision covers: one change of a review, or every change in the file. */
export type AgentReviewTarget =
  | { readonly kind: "change"; readonly review: AgentReview; readonly change: AgentChangeToReview }
  | { readonly kind: "all"; readonly path: string };

/** The assistant's changes to review in the workspace's agents. */
export interface AgentReviewHost {
  /**
   * The changes to review in the agent's saved file, or `null` when it has none. Rejects like
   * `AgentsHost.read`.
   */
  changesIn(ref: AgentRef): Promise<AgentReview | null>;
  /** Accepts what the target covers: the file stays as it is, and the change is no longer to review. */
  accept(target: AgentReviewTarget): Promise<AgentReviewDecision>;
  /** Rejects what the target covers: the file gets the values from before the assistant's change back. */
  reject(target: AgentReviewTarget): Promise<AgentReviewDecision>;
  /**
   * Calls `listener` each time the agent's changes to review may have changed: a write by the
   * assistant, an Accept, a Reject or an Undo. Returns the way to stop.
   */
  subscribe(ref: AgentRef, listener: () => void): () => void;
}

/** The changes to review in the open workspace's agents, provided by the app (`agents.review`). */
export const AgentReviewService: ServiceKey<AgentReviewHost> =
  serviceKey<AgentReviewHost>("agents.review");
