import type { AnswerResult, InboxAnswer, InboxItem } from "@halonicjs/ports";
import {
  joinRequestAnswerRequest,
  joinRequestToItem,
  secretProposalAnswerRequest,
  secretProposalToItem,
} from "./board-request-items.ts";
import type { AnswerRequest } from "./cards.ts";
import type { PaperclipIds } from "./ids.ts";
import { asRecords, type JsonRecord, text } from "./json.ts";
import type { MapContext } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import type { PaperclipRequestName } from "./requests.ts";
import { bodyOf, PaperclipClientError } from "./transport.ts";

/** The board requests the Inbox shows besides cards, approvals and decisions. */
export const boardRequestKinds = ["secret-proposal", "join-request"] as const;

/** One kind of board request. */
export type BoardRequestKind = (typeof boardRequestKinds)[number];

/** The secret proposal or join request item `item` names, or `undefined` for any other item. */
export function boardRequestOf(
  ids: PaperclipIds,
  item: string,
): { kind: BoardRequestKind; id: string } | undefined {
  for (const kind of boardRequestKinds) {
    const [id] = ids.read(item, kind) ?? [];
    if (id !== undefined) {
      return { kind, id };
    }
  }
  return undefined;
}

/** How each kind is read, mapped and answered. */
interface KindRules {
  list: PaperclipRequestName;
  /** The status that waits on the person, as the list's filter takes it. */
  waiting: string;
  toItem: (context: MapContext, record: JsonRecord) => InboxItem | undefined;
  request: (answer: InboxAnswer) => AnswerRequest | undefined;
}

const kinds: Readonly<Record<BoardRequestKind, KindRules>> = {
  "secret-proposal": {
    list: "listSecretProposals",
    waiting: "pending",
    toItem: secretProposalToItem,
    request: secretProposalAnswerRequest,
  },
  "join-request": {
    list: "listJoinRequests",
    waiting: "pending_approval",
    toItem: joinRequestToItem,
    request: joinRequestAnswerRequest,
  },
};

/**
 * The company's secret proposals and join requests (`paperclip-client.board-requests`): read for
 * the Inbox, and approved or rejected only when the person answers one in Halonic.
 */
export class PaperclipBoardRequests {
  readonly #reader: PaperclipReader;
  readonly #company: string;

  constructor(reader: PaperclipReader, company: string) {
    this.#reader = reader;
    this.#company = company;
  }

  /** Both kinds' waiting requests as inbox items. */
  async list(context: MapContext): Promise<InboxItem[]> {
    const items: InboxItem[] = [];
    for (const kind of boardRequestKinds) {
      const { toItem, waiting } = kinds[kind];
      const records = await this.#read(kind, waiting);
      items.push(...records.flatMap((record) => toItem(context, record) ?? []));
    }
    return items;
  }

  /**
   * Sends `answer` to request `id` of `kind`, answered as of `now`; one decided elsewhere answers
   * `already-answered`, and an answer other than Approve or Reject is refused unsent.
   */
  async answer(
    context: MapContext,
    target: { kind: BoardRequestKind; id: string },
    answer: InboxAnswer,
    now: () => Date,
  ): Promise<AnswerResult> {
    const { kind, id } = target;
    const rules = kinds[kind];
    const request = rules.request(answer);
    if (request === undefined) {
      return { outcome: "refused", reason: "bad-answer" };
    }
    const sent = await this.#reader.send(request.name, {
      path: { company: this.#company, [kind === "join-request" ? "join" : "proposal"]: id },
      body: request.body,
    });
    if (sent.kind === "ok") {
      return { outcome: "answered", answeredAt: now().toISOString() };
    }
    if (sent.failure === "offline" || sent.failure === "signed-out") {
      return { outcome: "refused", reason: sent.failure };
    }
    // Gone or no longer waiting: someone answered it in Paperclip, or it expired.
    const record = (await this.#read(kind)).find((each) => text(each, "id") === id);
    const item = record === undefined ? undefined : rules.toItem(context, record);
    if (item?.state.kind === "answered") {
      return { outcome: "already-answered", by: item.state.by, answeredAt: item.state.answeredAt };
    }
    if (item === undefined) {
      return { outcome: "refused", reason: "not-found" };
    }
    throw new PaperclipClientError(
      "Paperclip didn't take this answer; answer it in Paperclip.",
      "refused",
    );
  }

  /**
   * `kind`'s records, those in `status` only when given. A key whose person may not see them, as
   * Paperclip refuses join requests to a board member without the right to approve them, reads none.
   */
  async #read(kind: BoardRequestKind, status?: string): Promise<JsonRecord[]> {
    const name = kinds[kind].list;
    const answer = await this.#reader.send(name, {
      path: { company: this.#company },
      ...(status === undefined ? {} : { query: { status } }),
    });
    if (answer.kind === "failed" && answer.failure === "refused") {
      return [];
    }
    return asRecords(bodyOf(name, answer));
  }
}
