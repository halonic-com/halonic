// The shadow runner (plan PR 4): poll Paperclip through the read-only source,
// build each approval's card, check it, and write the result to the ledger.
// It records what a rule would have done and sends nothing: its only
// Paperclip dependency is the `ShadowSource` port, which can only read.

import type { Clock, Sha256 } from "@halonicjs/std";
import { type ApprovalRead, type SourceRef, toCard } from "./card.ts";
import type { EffectiveNeverList } from "./effective-list.ts";
import { checkEligibility } from "./eligibility.ts";
import { Ledger, type LedgerStore } from "./ledger.ts";
import { type LedgerInput, verifyChain } from "./ledger-entry.ts";
import {
  checkPinnedDocuments,
  type DocumentPins,
  type PinnedDocument,
} from "./pinned-documents.ts";
import { readReasonOf, type ShadowApprovalRead, type ShadowSource } from "./shadow-source.ts";

/** The `approvalId` of ledger entries about the run itself rather than one approval. */
export const runEntryId = "run";

/** The run entry written at every start, so a restart shows in the ledger. */
export const runStarted = "run.started";

/** The run entry written after a poll that evaluated every pending approval. */
export const pollRan = "poll.ran";

/** How far the runner goes, and how long it waits. */
export interface ShadowLimits {
  /** More pending approvals than this stops the poll with `read.too_large`. */
  readonly maxApprovalsPerPoll: number;
  /** The laptop clock may differ from the server's `Date` by at most this. */
  readonly maxClockSkewMs: number;
  /** The wait between two polls. */
  readonly pollIntervalMs: number;
  /** The longest wait after Paperclip answered 429 more than once. */
  readonly maxBackoffMs: number;
}

/** The limits Studio runs with. */
export const shadowLimits: ShadowLimits = {
  maxApprovalsPerPoll: 500,
  maxClockSkewMs: 2 * 60 * 1000,
  pollIntervalMs: 5 * 60 * 1000,
  maxBackoffMs: 60 * 60 * 1000,
};

/** What a {@link ShadowRunner} needs. */
export interface ShadowRunnerOptions {
  readonly source: ShadowSource;
  readonly store: LedgerStore;
  readonly digest: Sha256;
  /** The laptop's clock; the never-list's 24 hours are judged by the server's. */
  readonly clock: Clock;
  readonly pins: DocumentPins;
  readonly limits?: ShadowLimits;
}

/** Why the runner won't start, or won't go on, until a person looks. */
export type HaltReason =
  | "ledger.chain_broken"
  | "ledger.head_mismatch"
  | "ledger.write_failed"
  | "guard.refused"
  | "run.not_started";

/** What one poll did. */
export interface PollReport {
  /** Approvals Paperclip listed as pending. */
  readonly pending: number;
  /** Of those, the ones evaluated and written to the ledger. */
  readonly evaluated: number;
  /** Why the poll stopped before the end, or `undefined` when it went through. */
  readonly stopped?: string;
}

/** Thrown inside a poll only, and turned into a stop entry. */
class PollStop {
  readonly reason: string;

  constructor(reason: string) {
    this.reason = reason;
  }
}

/** Thrown inside a poll only: the ledger can't take an entry, so nothing may go on. */
class LedgerFailure {}

/**
 * Polls, evaluates and records, one read at a time. The stop document and
 * the never-list are read again before every card (H7.4), so a stop lands
 * within one card. A poll that stops writes one run entry with its reason.
 */
export class ShadowRunner {
  readonly #options: ShadowRunnerOptions;
  readonly #limits: ShadowLimits;
  readonly #ledger: Ledger;
  #halted: HaltReason | undefined = "run.not_started";
  #delayMs: number;
  #documents: { neverList: PinnedDocument; stop: PinnedDocument } | undefined;

  constructor(options: ShadowRunnerOptions) {
    this.#options = options;
    this.#limits = options.limits ?? shadowLimits;
    this.#delayMs = this.#limits.pollIntervalMs;
    this.#ledger = new Ledger({
      store: options.store,
      digest: options.digest,
      clock: options.clock,
    });
  }

  /** Why the runner stopped for good, or `undefined` while it runs. */
  halted(): HaltReason | undefined {
    return this.#halted;
  }

  /** How long to wait before the next poll: longer after Paperclip answered 429. */
  nextDelayMs(): number {
    return this.#delayMs;
  }

  /** Both pinned documents as last read, for the digest's revision list. */
  documents(): { neverList: PinnedDocument; stop: PinnedDocument } | undefined {
    return this.#documents;
  }

  /**
   * Checks the ledger and records the start. It never starts a new chain on
   * its own: a broken chain, or one without the last digest's head, halts.
   *
   * @param lastDigestHead - the ledger head the last digest named, when there is one
   */
  async start(lastDigestHead?: string): Promise<HaltReason | undefined> {
    const { store, digest } = this.#options;
    const entries = await store.entries();
    if (!(await verifyChain(entries, digest)).ok) return this.#halt("ledger.chain_broken");
    if (lastDigestHead !== undefined && !entries.some((entry) => entry.hash === lastDigestHead)) {
      return this.#halt("ledger.head_mismatch");
    }
    this.#halted = undefined;
    try {
      await this.#ledger.append(runEntry(runStarted));
    } catch {
      return this.#halt("ledger.write_failed");
    }
    return undefined;
  }

  /** Polls once: every pending approval is evaluated and written, or the poll stops with a reason. */
  async poll(): Promise<PollReport> {
    if (this.#halted !== undefined) return { pending: 0, evaluated: 0, stopped: this.#halted };
    const progress = { pending: 0, evaluated: 0 };
    try {
      await this.#pollNow(progress);
      if (this.#options.source.counts().refused > 0)
        throw new PollStop(this.#halt("guard.refused"));
      await this.#append(runEntry(pollRan));
      this.#delayMs = this.#limits.pollIntervalMs;
      return progress;
    } catch (problem) {
      if (problem instanceof LedgerFailure) {
        return { ...progress, stopped: this.#halt("ledger.write_failed") };
      }
      if (!(problem instanceof PollStop)) throw problem;
      return { ...progress, stopped: await this.#recordStop(problem.reason) };
    }
  }

  async #pollNow(progress: { pending: number; evaluated: number }): Promise<void> {
    const { source } = this.#options;
    const pending = await this.#read(() => source.pendingApprovals());
    progress.pending = pending.length;
    if (pending.length > this.#limits.maxApprovalsPerPoll) throw new PollStop("read.too_large");
    // Read the switches even with nothing pending, so a stop shows in the ledger at once.
    if (pending.length === 0) await this.#gate();
    for (const record of pending) {
      const list = await this.#gate();
      const read = await this.#read(() => source.approval(record.id));
      const reason = await this.#reasonFor(read, list);
      await this.#append({
        approvalId: record.id,
        // A payload the card can't read can't be hashed either; the reason says so (A41).
        payload: reason === "card.unreadable_payload" ? null : read.approval.payload,
        comments: read.comments.map((comment) => comment.body),
        outcome: "no_decision",
        reason,
      });
      progress.evaluated += 1;
    }
  }

  /** The first reason the approval gets no decision. v1 has no rules, so there is always one. */
  async #reasonFor(read: ShadowApprovalRead, list: EffectiveNeverList): Promise<string> {
    const card = await toCard(this.#approvalRead(read), this.#options.digest);
    if (!card.ok) return card.reason;
    const eligibility = checkEligibility(card.card, card.claims, list);
    if (eligibility.eligible) return "rule.none";
    if (eligibility.reason !== "card.untyped") return eligibility.reason;
    // Keep why it is untyped besides v1 having no kinds, such as a spoofed requester (A1).
    const extra = card.card.untypedBecause.filter((reason) => reason !== "no_live_kinds");
    return [eligibility.reason, ...extra].join(":");
  }

  /**
   * The never-list in force, judged by the server's clock, or a stop: no
   * server time, a laptop clock too far off it, or a document that doesn't
   * check out.
   */
  async #gate(): Promise<EffectiveNeverList> {
    const { source, pins, clock } = this.#options;
    const documents = await this.#read(() => source.pinnedDocuments(pins.issueId));
    this.#documents = documents;
    const serverTime = source.serverTime();
    if (serverTime === undefined || Number.isNaN(serverTime.getTime())) {
      throw new PollStop("read.no_server_time");
    }
    if (Math.abs(clock.now().getTime() - serverTime.getTime()) > this.#limits.maxClockSkewMs) {
      throw new PollStop("clock.skew");
    }
    const gate = checkPinnedDocuments(documents, pins, { now: () => serverTime });
    if (!gate.ok) throw new PollStop(gate.reason);
    return gate.list;
  }

  #approvalRead(read: ShadowApprovalRead): ApprovalRead {
    const readAt = this.#options.source.serverTime()?.toISOString() ?? "";
    const from = (endpoint: string): SourceRef => ({ system: "paperclip", endpoint, readAt });
    return {
      ...read,
      workspaceId: this.#options.pins.workspaceId,
      // v1 reads no pull requests: no rule can name a PR kind yet.
      pathClasses: [],
      sources: {
        approval: from("getApproval"),
        activity: from("listCompanyActivity"),
        comments: from("listApprovalComments"),
        linkedIssues: from("listApprovalTasks"),
      },
    };
  }

  /** Runs one read; a failure stops the poll with the read's reason code. */
  async #read<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      throw new PollStop(readReasonOf(error));
    }
  }

  async #append(input: LedgerInput): Promise<void> {
    try {
      await this.#ledger.append(input);
    } catch {
      throw new LedgerFailure();
    }
  }

  async #recordStop(reason: string): Promise<string> {
    if (reason === "read.rate_limited") {
      this.#delayMs = Math.min(this.#delayMs * 2, this.#limits.maxBackoffMs);
    }
    try {
      await this.#ledger.append(runEntry(reason));
      return reason;
    } catch {
      return this.#halt("ledger.write_failed");
    }
  }

  #halt(reason: HaltReason): HaltReason {
    this.#halted = reason;
    return reason;
  }
}

function runEntry(reason: string): LedgerInput {
  return { approvalId: runEntryId, payload: null, comments: [], outcome: "no_decision", reason };
}
