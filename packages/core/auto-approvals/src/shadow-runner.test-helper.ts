import type { Sha256 } from "@halonicjs/std";
import type { ApprovalRecord } from "./card.ts";
import type { LedgerStore } from "./ledger.ts";
import type { LedgerEntry } from "./ledger-entry.ts";
import type { DocumentPins, PinnedDocument } from "./pinned-documents.ts";
import { ShadowRunner } from "./shadow-runner.ts";
import type { ShadowApprovalRead, ShadowCallCounts, ShadowSource } from "./shadow-source.ts";

// An in-memory source and store for the runner's unit tests. The end-to-end red-team cases, through
// the real reader and a fake Paperclip, are in paperclip-client's `shadow-red-team.test.ts`.

export const workspace = "c1";
export const owner = "u-owner";
export const now = new Date("2026-11-27T10:00:00.000Z");

export const pins: DocumentPins = {
  workspaceId: workspace,
  issueId: "i-pinned",
  neverListDocumentId: "d-never",
  stopDocumentId: "d-stop",
  ownerUserIds: [owner],
};

/** A pinned document with one owner revision saying `body`. */
export function pinned(id: string, body: string): PinnedDocument {
  return {
    id,
    issueId: pins.issueId,
    companyId: workspace,
    locked: true,
    latestRevisionId: `${id}-r1`,
    revisions: [
      {
        id: `${id}-r1`,
        revisionNumber: 1,
        body,
        createdAt: "2026-11-25T10:00:00.000Z",
        authorUserId: owner,
        authorAgentId: null,
      },
    ],
  };
}

/** A clean pending approval read, by agent `a1`. */
export function approvalRead(id: string, change: Partial<ApprovalRecord> = {}): ShadowApprovalRead {
  return {
    approval: {
      id,
      companyId: workspace,
      type: "request_board_approval",
      status: "pending",
      requestedByAgentId: "a1",
      decidedByUserId: null,
      payload: { title: "Publish" },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      ...change,
    },
    activity: [{ action: "approval.created", actorType: "agent", actorId: "a1", createdAt: "" }],
    comments: [],
    linkedIssues: [],
  };
}

/** A source that serves what its fields hold, or throws `failure` from every read. */
export class MemorySource implements ShadowSource {
  approvals: ShadowApprovalRead[] = [approvalRead("p1")];
  neverList = pinned("d-never", `version: 2\nworkspaceId: ${workspace}\nentries: []\n`);
  stop = pinned("d-stop", "stop: false\n");
  time: Date | undefined = now;
  failure: unknown;
  calls: ShadowCallCounts = { sent: 0, refused: 0, refusedNotGet: 0 };

  async pendingApprovals(): Promise<readonly ApprovalRecord[]> {
    this.#maybeFail();
    return this.approvals.map((read) => read.approval);
  }

  async approval(approvalId: string): Promise<ShadowApprovalRead> {
    this.#maybeFail();
    const read = this.approvals.find((each) => each.approval.id === approvalId);
    if (read === undefined) throw new Error("No such approval.");
    return read;
  }

  async pinnedDocuments(): Promise<{ neverList: PinnedDocument; stop: PinnedDocument }> {
    this.#maybeFail();
    return { neverList: this.neverList, stop: this.stop };
  }

  serverTime(): Date | undefined {
    return this.time;
  }

  counts(): ShadowCallCounts {
    return this.calls;
  }

  #maybeFail(): void {
    if (this.failure !== undefined) throw this.failure;
  }
}

/** A store in memory that can refuse writes. */
export class MemoryStore implements LedgerStore {
  stored: LedgerEntry[] = [];
  refuse = false;

  async last(): Promise<LedgerEntry | null> {
    return this.stored.at(-1) ?? null;
  }

  async append(entry: LedgerEntry): Promise<void> {
    if (this.refuse) throw new Error("The disk is full.");
    this.stored.push(entry);
  }

  async entries(): Promise<readonly LedgerEntry[]> {
    return this.stored;
  }
}

/** Makes runners over a source and a store with `digest`, on a laptop clock at `now`. */
export function runnerWith(digest: Sha256) {
  return (source: MemorySource, store = new MemoryStore()) =>
    new ShadowRunner({ source, store, digest, clock: { now: () => now }, pins });
}

/** Each entry's reason, oldest first. */
export function reasons(store: MemoryStore): string[] {
  return store.stored.map((entry) => entry.reason);
}
