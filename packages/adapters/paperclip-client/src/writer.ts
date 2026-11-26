import type { AnswerResult, InboxAnswer, InboxItem, MessagingRefusal } from "@halonicjs/ports";
import { type BoardRequestKind, PaperclipBoardRequests } from "./board-requests.ts";
import { budgetOverrideType } from "./budget-amount.ts";
import { answerBudgetOverride } from "./budget-incidents.ts";
import { approvalAnswerRequest, approvalToItem, cardAnswerRequest, cardToItem } from "./cards.ts";
import { decisionAnswerRequest, decisionPage, decisionToItem } from "./decisions.ts";
import { asRecord, asRecords, type JsonRecord, text } from "./json.ts";
import type { MapContext } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import { UnsafeIdError } from "./requests.ts";
import { answerStepperCard } from "./stepper-answer.ts";
import { type PaperclipSteppers, pinnedRevision } from "./steppers.ts";
import { type PaperclipAnswer, PaperclipClientError } from "./transport.ts";

/** Which item an answer is for: Paperclip's IDs of a card (task, card), an approval or a decision. */
export interface AnswerTarget {
  card: readonly string[] | undefined;
  approval: readonly string[] | undefined;
  decision?: readonly string[] | undefined;
  /** A secret proposal or a join request (`paperclip-client.board-requests`). */
  boardRequest?: { kind: BoardRequestKind; id: string } | undefined;
}

/** What sending a chat message did, before it is mapped to the port. */
export type SendOutcome =
  | { kind: "sent"; comment: JsonRecord }
  | { kind: "refused"; reason: MessagingRefusal };

/** The port's refusal for a failed write, or `undefined` when the failure is one the port has no word for. */
export function refusalOf(answer: PaperclipAnswer): MessagingRefusal | undefined {
  if (answer.kind === "ok") {
    return undefined;
  }
  const { failure } = answer;
  return failure === "offline" || failure === "signed-out" || failure === "not-found"
    ? failure
    : undefined;
}

function refused(reason: MessagingRefusal): AnswerResult {
  return { outcome: "refused", reason };
}

/** `already-answered` for an item that was answered, or `undefined` while it is open. */
function alreadyAnswered(item: InboxItem | undefined): AnswerResult | undefined {
  if (item?.state.kind !== "answered") {
    return undefined;
  }
  return { outcome: "already-answered", by: item.state.by, answeredAt: item.state.answeredAt };
}

function unexpected(name: string): PaperclipClientError {
  return new PaperclipClientError(`Paperclip refused ${name}.`, "refused");
}

/**
 * Answers cards and approvals and sends chat messages. It writes only when
 * the person answers or sends in Halonic: `answer` and `send` are its only
 * callers, and nothing in the provider approves, rejects or comments on its
 * own, on a poll or a retry. A write is sent once
 * or refused: offline it is `refused` with `offline` and never queued to try
 * later, because an answer sent late can be wrong by then. An unsafe ID is
 * refused before any request.
 */
export class PaperclipWriter {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #now: () => Date;
  readonly #steppers: PaperclipSteppers | undefined;

  /** `company` is the one whose decisions it reads before answering one. */
  constructor(
    reader: PaperclipReader,
    company: string,
    now: () => Date,
    steppers?: PaperclipSteppers,
  ) {
    this.#reader = reader;
    this.#company = company;
    this.#now = now;
    this.#steppers = steppers;
  }

  /** Gives `answer` to the card or approval `target` names. */
  async answer(
    context: MapContext,
    target: AnswerTarget,
    answer: InboxAnswer,
  ): Promise<AnswerResult> {
    // Only a stepper card takes an `action-result`, and only with a catalog to read its request.
    if (answer.kind === "action-result" && (this.#steppers === undefined || !target.card)) {
      return refused("bad-answer");
    }
    try {
      if (target.card !== undefined) {
        return await this.#answerCard(context, target.card, answer);
      }
      if (target.approval !== undefined) {
        return await this.#answerApproval(context, target.approval, answer);
      }
      if (target.decision !== undefined) {
        return await this.#answerDecision(context, target.decision, answer);
      }
      if (target.boardRequest !== undefined) {
        const requests = new PaperclipBoardRequests(this.#reader, this.#company);
        return await requests.answer(context, target.boardRequest, answer, this.#now);
      }
    } catch (error) {
      if (error instanceof UnsafeIdError) {
        return refused("not-found");
      }
      throw error;
    }
    return refused("not-found");
  }

  /** Comments `body` on chat task `task`. */
  async send(task: string, body: string): Promise<SendOutcome> {
    let sent: PaperclipAnswer;
    try {
      // Paperclip needs a request ID on chat messages, so a repeated request isn't posted twice.
      sent = await this.#reader.send("commentOnChat", {
        path: { task },
        body: { body, clientRequestId: crypto.randomUUID() },
      });
    } catch (error) {
      if (error instanceof UnsafeIdError) {
        return { kind: "refused", reason: "not-found" };
      }
      throw error;
    }
    const reason = refusalOf(sent);
    if (reason !== undefined) {
      return { kind: "refused", reason };
    }
    const comment = sent.kind === "ok" ? asRecord(sent.body) : undefined;
    if (comment === undefined) {
      throw unexpected("commentOnChat");
    }
    return { kind: "sent", comment };
  }

  async #answerCard(
    context: MapContext,
    ids: readonly string[],
    answer: InboxAnswer,
  ): Promise<AnswerResult> {
    const [task = "", card = ""] = ids;
    const before = await this.#readCard(context, task, card);
    if (before.kind === "refused") {
      return before.result;
    }
    const answered = alreadyAnswered(before.item);
    if (answered !== undefined) {
      return answered;
    }
    if (answer.kind === "action-result" && this.#steppers !== undefined) {
      const steppers = { reader: this.#reader, steppers: this.#steppers, now: this.#now };
      return answerStepperCard(steppers, { task, card }, before.record, answer);
    }
    if (await this.#servesStepper(task, before.record)) {
      // A stepper item offers no options: it takes only the stepper's result.
      return refused("bad-answer");
    }
    const request = cardAnswerRequest(before.record, answer);
    if (request === undefined) {
      throw new PaperclipClientError(
        "This answer doesn't fit the card; answer it in Paperclip.",
        "refused",
      );
    }
    const sent = await this.#reader.send(request.name, {
      path: { task, card },
      body: request.body,
    });
    if (sent.kind === "ok") {
      return {
        outcome: "answered",
        answeredAt: text(asRecord(sent.body), "resolvedAt") ?? this.#now().toISOString(),
      };
    }
    const reason = refusalOf(sent);
    if (reason !== undefined) {
      return refused(reason);
    }
    if (sent.failure === "conflict" && sent.code === "interaction_already_resolved") {
      const after = await this.#readCard(context, task, card);
      return (
        (after.kind === "found" ? alreadyAnswered(after.item) : undefined) ?? refused("not-found")
      );
    }
    // Superseded, stale or on a closed task: the card no longer waits on anyone.
    if (sent.failure === "conflict") {
      return refused("not-found");
    }
    throw unexpected(request.name);
  }

  /** Whether card `record` is served as a stepper item: it pins a request this Halonic can read. */
  async #servesStepper(task: string, record: JsonRecord): Promise<boolean> {
    const revision = pinnedRevision(record);
    if (revision === undefined || this.#steppers === undefined) return false;
    return (await this.#steppers.read(task, revision)).kind === "readable";
  }

  async #readCard(
    context: MapContext,
    task: string,
    card: string,
  ): Promise<
    | { kind: "found"; record: JsonRecord; item: InboxItem | undefined }
    | { kind: "refused"; result: AnswerResult }
  > {
    const listed = await this.#reader.send("listTaskCards", { path: { task } });
    if (listed.kind === "failed") {
      const reason = refusalOf(listed);
      if (reason === undefined) {
        throw unexpected("listTaskCards");
      }
      return { kind: "refused", result: refused(reason) };
    }
    const records = asRecords(listed.body);
    const record = records.find((candidate) => text(candidate, "id") === card);
    const item = record === undefined ? undefined : cardToItem(context, task, record);
    if (record === undefined || item === undefined) {
      return { kind: "refused", result: refused("not-found") };
    }
    return { kind: "found", record, item };
  }

  async #answerApproval(
    context: MapContext,
    ids: readonly string[],
    answer: InboxAnswer,
  ): Promise<AnswerResult> {
    const [approval = ""] = ids;
    const request = approvalAnswerRequest(answer);
    if (request === undefined) {
      throw new PaperclipClientError(
        "An approval takes Approve, Reject or Request changes only.",
        "refused",
      );
    }
    if (answer.kind === "option" && answer.option !== "request-changes") {
      const budget = await this.#answerIfBudgetOverride(context, approval, answer);
      if (budget !== undefined) {
        return budget;
      }
    }
    const sent = await this.#reader.send(request.name, { path: { approval }, body: request.body });
    if (sent.kind === "ok") {
      return {
        outcome: "answered",
        answeredAt: text(asRecord(sent.body), "decidedAt") ?? this.#now().toISOString(),
      };
    }
    const reason = refusalOf(sent);
    if (reason !== undefined) {
      return refused(reason);
    }
    // Paperclip refuses to decide an approval twice; read it to say who decided it.
    const current = await this.#reader.send("getApproval", { path: { approval } });
    const record = current.kind === "ok" ? asRecord(current.body) : undefined;
    const answered = alreadyAnswered(
      record === undefined ? undefined : approvalToItem(context, record, undefined),
    );
    if (answered === undefined) {
      throw unexpected(request.name);
    }
    return answered;
  }

  /**
   * Approve or Reject on a budget override, which resolves its budget incident instead of only
   * recording the answer (`paperclip-client.budget-incidents`); `undefined` for any other
   * approval, or one whose type can't be read, which takes the approval routes.
   */
  async #answerIfBudgetOverride(
    context: MapContext,
    approval: string,
    answer: Extract<InboxAnswer, { kind: "option" }>,
  ): Promise<AnswerResult | undefined> {
    const current = await this.#reader.send("getApproval", { path: { approval } });
    const reason = refusalOf(current);
    if (reason !== undefined) {
      return refused(reason);
    }
    const record = current.kind === "ok" ? asRecord(current.body) : undefined;
    if (record === undefined || text(record, "type") !== budgetOverrideType) {
      return undefined;
    }
    const answerer = { reader: this.#reader, company: this.#company, now: this.#now };
    return (
      alreadyAnswered(approvalToItem(context, record, undefined)) ??
      (await answerBudgetOverride(answerer, approval, answer))
    );
  }

  async #answerDecision(
    context: MapContext,
    ids: readonly string[],
    answer: InboxAnswer,
  ): Promise<AnswerResult> {
    const [decision = ""] = ids;
    const open = await this.#findDecision(decision, "open");
    if (open === undefined) {
      const decided = await this.#findDecision(decision, "decided");
      const item = decided === undefined ? undefined : decisionToItem(context, decided);
      return alreadyAnswered(item) ?? refused("not-found");
    }
    const request = decisionAnswerRequest(decision, open, answer);
    if (request === undefined) {
      throw new PaperclipClientError(
        "This answer doesn't fit the decision; answer it in Paperclip.",
        "refused",
      );
    }
    const sent = await this.#reader.send(request.name, { path: { decision }, body: request.body });
    if (sent.kind === "ok") {
      return { outcome: "answered", answeredAt: this.#now().toISOString() };
    }
    const reason = refusalOf(sent);
    if (reason !== undefined) {
      return refused(reason);
    }
    // Decided by someone else meanwhile, or expired: it no longer waits on the person.
    if (sent.failure === "conflict") {
      const decided = await this.#findDecision(decision, "decided");
      const item = decided === undefined ? undefined : decisionToItem(context, decided);
      return alreadyAnswered(item) ?? refused("not-found");
    }
    throw unexpected(request.name);
  }

  /** Decision `decision` among the company's decisions in `status`, as Paperclip has it now. */
  async #findDecision(decision: string, status: string): Promise<JsonRecord | undefined> {
    const body = await this.#reader.read("listDecisions", {
      path: { company: this.#company },
      query: { status, limit: decisionPage },
    });
    return asRecords(body).find((record) => text(record, "id") === decision);
  }
}
