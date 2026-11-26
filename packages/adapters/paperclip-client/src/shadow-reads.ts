import type {
  ActivityEntry,
  ApprovalComment,
  ApprovalRecord,
  DocumentRevision,
  LinkedIssue,
  PinnedDocument,
} from "@halonicjs/auto-approvals";
import { readAtMost } from "./avatars.ts";
import { asList, asRecord, field, type JsonRecord, text } from "./json.ts";
import { type PaperclipRequestName, paperclipRequests } from "./requests.ts";
import {
  isShadowRequest,
  ShadowCallCounter,
  type ShadowCallCounts,
  type ShadowRequestName,
} from "./shadow-fetch.ts";
import {
  type BodyReader,
  bodyOf,
  PaperclipClientError,
  type PaperclipKeyGuard,
  PaperclipTransport,
  type RequestDetails,
} from "./transport.ts";

/** The largest answer the shadow reader reads, in bytes; a larger one fails closed. */
export const shadowAnswerMaxBytes = 1024 * 1024;

/** Where the shadow reader reads, with which key, for which company. */
export interface PaperclipShadowReaderOptions {
  address: string;
  /** The key, or the guard that hands it to each request. The reader keeps it in its transport. */
  key: string | PaperclipKeyGuard;
  /** The Paperclip company Studio is connected to; an answer for another fails closed. */
  company: string;
  /** The `fetch` under the reader's own GET-only guard; the global one by default. */
  fetch?: typeof fetch;
}

/** Everything read about one approval, before it becomes a card. */
export interface ShadowApprovalRead {
  readonly approval: ApprovalRecord;
  readonly activity: readonly ActivityEntry[];
  readonly comments: readonly ApprovalComment[];
  readonly linkedIssues: readonly LinkedIssue[];
}

/**
 * The read-only Paperclip source for auto approvals in shadow mode (`paperclip-client.shadow-reads`,
 * threat model rev 2, G1). It has its own transport, whose `fetch` refuses any method but GET and
 * any request off the short shadow list before anything is sent. The runner gets this object only:
 * never the messaging port, the writer, the shared transport or the key. Every read fails closed,
 * by throwing, on a redirect, any answer but 200, a body for another company or one over
 * {@link shadowAnswerMaxBytes}.
 */
export class PaperclipShadowReader {
  readonly #transport: PaperclipTransport;
  readonly #company: string;
  readonly #counter = new ShadowCallCounter();

  constructor(options: PaperclipShadowReaderOptions) {
    this.#company = options.company;
    this.#transport = new PaperclipTransport({
      address: options.address,
      key: options.key,
      fetch: this.#counter.guardFetch(options.fetch ?? fetch),
    });
  }

  /** The calls made and refused so far, for the daily digest (G4). */
  counts(): ShadowCallCounts {
    return this.#counter.counts();
  }

  /** The company's pending approvals. */
  async pendingApprovals(): Promise<ApprovalRecord[]> {
    const body = await this.#read("listApprovals", {
      path: { company: this.#company },
      query: { status: "pending" },
    });
    return asList(body).map((each) => this.#approvalOf(each));
  }

  /** One approval with its `approval.created` activity, its comments and its linked issues. */
  async approval(approvalId: string): Promise<ShadowApprovalRead> {
    const path = { approval: approvalId };
    const approval = this.#approvalOf(await this.#read("getApproval", { path }));
    if (approval.id !== approvalId) throw badAnswer("another approval");
    const activity = await this.#read("listCompanyActivity", {
      path: { company: this.#company },
      query: { entityType: "approval", entityId: approvalId },
    });
    const comments = await this.#read("listApprovalComments", { path });
    const issues = await this.#read("listApprovalTasks", { path });
    return {
      approval,
      activity: asList(activity).map((each) => this.#activityOf(each, approvalId)),
      comments: asList(comments).map((each) => commentOf(this.#ofApproval(each, approvalId))),
      linkedIssues: asList(issues).map((each) => issueOf(this.#ours(each))),
    };
  }

  /** The never-list and the stop document on pinned issue `issueId`, each with every revision. */
  async pinnedDocuments(
    issueId: string,
  ): Promise<{ neverList: PinnedDocument; stop: PinnedDocument }> {
    const path = { task: issueId };
    return {
      neverList: await this.#document("readNeverList", "listNeverListRevisions", path),
      stop: await this.#document("readStopDocument", "listStopDocumentRevisions", path),
    };
  }

  async #document(
    read: ShadowRequestName,
    revisions: ShadowRequestName,
    path: { task: string },
  ): Promise<PinnedDocument> {
    const document = this.#ours(await this.#read(read, { path }));
    const listed = asList(await this.#read(revisions, { path }));
    const documentId = required(document, "id");
    return {
      id: documentId,
      issueId: required(document, "issueId"),
      companyId: required(document, "companyId"),
      locked: text(document, "lockedAt") !== undefined,
      latestRevisionId: text(document, "latestRevisionId") ?? null,
      revisions: listed.map((each) => revisionOf(this.#ours(each), documentId)),
    };
  }

  /** Sends shadow row `name` and gives its body, or throws: nothing else is ever sent. */
  async #read(name: PaperclipRequestName, details: RequestDetails): Promise<unknown> {
    if (!isShadowRequest(name)) {
      throw this.#counter.refuse(paperclipRequests[name].method, name);
    }
    return bodyOf(name, await this.#transport.sendReading(name, details, limitedJson));
  }

  /** `value` as a record of this company, or a thrown error: another company's fails closed. */
  #ours(value: unknown): JsonRecord {
    const record = asRecord(value);
    if (record === undefined || text(record, "companyId") !== this.#company) {
      throw badAnswer("an answer for another company");
    }
    return record;
  }

  /** `value` as a record of this company about approval `approvalId`; any other fails closed. */
  #ofApproval(value: unknown, approvalId: string): JsonRecord {
    const record = this.#ours(value);
    if (text(record, "approvalId") !== approvalId) throw badAnswer("a comment on another approval");
    return record;
  }

  #approvalOf(value: unknown): ApprovalRecord {
    const record = this.#ours(value);
    return {
      id: required(record, "id"),
      companyId: required(record, "companyId"),
      type: required(record, "type"),
      status: required(record, "status"),
      requestedByAgentId: text(record, "requestedByAgentId") ?? null,
      decidedByUserId: text(record, "decidedByUserId") ?? null,
      payload: field(record, "payload"),
      createdAt: required(record, "createdAt"),
      updatedAt: required(record, "updatedAt"),
    };
  }

  #activityOf(value: unknown, approvalId: string): ActivityEntry {
    const record = this.#ours(value);
    // Paperclip filters by entity; an entry for anything else means the filter didn't hold.
    if (text(record, "entityType") !== "approval" || text(record, "entityId") !== approvalId) {
      throw badAnswer("activity for another entity");
    }
    return {
      action: required(record, "action"),
      actorType: required(record, "actorType"),
      actorId: required(record, "actorId"),
      createdAt: required(record, "createdAt"),
    };
  }
}

/** Reads a 200 answer of at most {@link shadowAnswerMaxBytes} as JSON; anything else throws. */
const limitedJson: BodyReader = {
  accept: "application/json",
  async read(name, response) {
    if (response.status !== 200) {
      await response.body?.cancel();
      throw badAnswer(`a ${response.status} answer to ${name}`);
    }
    const bytes = await readAtMost(response, shadowAnswerMaxBytes);
    if (bytes === undefined) throw badAnswer(`an answer to ${name} over the size limit`);
    try {
      return { kind: "ok", body: JSON.parse(new TextDecoder().decode(bytes)) };
    } catch {
      throw badAnswer(`an answer to ${name} that isn't JSON`);
    }
  },
};

function commentOf(record: JsonRecord): ApprovalComment {
  const byAgent = text(record, "authorAgentId") !== undefined;
  const byUser = text(record, "authorUserId") !== undefined;
  return { authorType: authorTypeOf(byAgent, byUser), body: text(record, "body") ?? "" };
}

/** Neither or both is a shape Studio doesn't know, and an unknown author counts as touched. */
function authorTypeOf(byAgent: boolean, byUser: boolean): string {
  if (byAgent === byUser) return "unknown";
  return byAgent ? "agent" : "user";
}

function issueOf(record: JsonRecord): LinkedIssue {
  return {
    id: required(record, "id"),
    title: text(record, "title") ?? "",
    description: text(record, "description") ?? null,
  };
}

function revisionOf(record: JsonRecord, documentId: string): DocumentRevision {
  if (text(record, "documentId") !== documentId) throw badAnswer("a revision of another document");
  const revisionNumber = field(record, "revisionNumber");
  if (typeof revisionNumber !== "number") throw badAnswer("a revision without a number");
  return {
    id: required(record, "id"),
    revisionNumber,
    body: text(record, "body") ?? "",
    createdAt: required(record, "createdAt"),
    authorUserId: text(record, "createdByUserId") ?? null,
    authorAgentId: text(record, "createdByAgentId") ?? null,
  };
}

function required(record: JsonRecord, name: string): string {
  const value = text(record, name);
  if (value === undefined) throw badAnswer(`an answer without ${name}`);
  return value;
}

function badAnswer(what: string): PaperclipClientError {
  return new PaperclipClientError(`The shadow reader got ${what}.`, "bad-answer");
}
