import {
  type StepperCatalog,
  type ValidatedStepperRequest,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import {
  checkInboxStepperRequest,
  type InboxItem,
  type InboxStepperRequest,
  inboxStepperFormat,
} from "@halonicjs/ports";
import { asRecord, field, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";
import { fitsSegment } from "./requests.ts";
import { bodyOf, type PaperclipAnswer } from "./transport.ts";

/** The document key a card pins its stepper request in (architecture note on HAL-17491, 7.2). */
export const stepperRequestKey = "stepper-request";

/** The longest reason a card that can't be read shows, so a long list of problems stays readable. */
const maxReasonLength = 500;

/** A pinned request as the provider read it: checked and ready to serve, or why it can't be read. */
export type PinnedStepper =
  | { kind: "readable"; stepper: InboxStepperRequest; validated: ValidatedStepperRequest }
  | { kind: "unreadable"; reason: string };

/**
 * The `stepper-request` revision a card pins, or `undefined` for any other
 * card. Only a confirmation card can pin a document revision in Paperclip,
 * and Paperclip expires it once that document has a newer revision.
 */
export function pinnedRevision(record: JsonRecord): string | undefined {
  if (text(record, "kind") !== "request_confirmation") return undefined;
  const target = asRecord(field(asRecord(field(record, "payload")), "target"));
  if (text(target, "type") !== "issue_document" || text(target, "key") !== stepperRequestKey) {
    return undefined;
  }
  return text(target, "revisionId");
}

function unreadable(reasons: readonly string[]): PinnedStepper {
  const reason = reasons.join("; ");
  return {
    kind: "unreadable",
    reason: reason.length > maxReasonLength ? `${reason.slice(0, maxReasonLength - 1)}…` : reason,
  };
}

/**
 * Reads the stepper requests that cards pin, checks them against the catalog
 * this Halonic has, and writes their results. It reads only the document
 * `stepper-request` and writes only `stepper-result`: each request on the
 * list names its key (`paperclip-client.stepper-requests`).
 */
export class PaperclipSteppers {
  readonly #reader: PaperclipReader;
  readonly #catalog: StepperCatalog;

  constructor(reader: PaperclipReader, catalog: StepperCatalog) {
    this.#reader = reader;
    this.#catalog = catalog;
  }

  /** The catalog requests are checked against, which the result also reads to spot secret steps. */
  get catalog(): StepperCatalog {
    return this.#catalog;
  }

  /**
   * Revision `revision` of task `task`'s request, checked with
   * `validateStepperRequest` and then with the port's allow-list. A revision
   * Paperclip doesn't have is unreadable; offline or signed out, it throws.
   */
  async read(task: string, revision: string): Promise<PinnedStepper> {
    if (!fitsSegment("revision", revision)) return unreadable(["the card pins no revision"]);
    const answer = await this.#reader.send("readStepperRequest", { path: { task, revision } });
    if (answer.kind === "failed" && answer.failure === "not-found") {
      return unreadable(["the request document or its revision isn't there"]);
    }
    const record = asRecord(bodyOf("readStepperRequest", answer));
    const body = field(record, "body");
    if (text(record, "key") !== stepperRequestKey || typeof body !== "string") {
      return unreadable(["Paperclip's answer holds no request document"]);
    }
    const checked = validateStepperRequest(body, this.#catalog);
    if (!checked.ok) return unreadable(checked.error);
    const stepper: InboxStepperRequest = {
      format: inboxStepperFormat,
      document: body,
      revision,
      touches: checked.value.touches.map(({ block, risk, targets }) => ({
        block,
        risk,
        targets: targets.map(({ service, kind, name }) => ({ service, kind, name })),
      })),
      changed: field(record, "isLatest") !== true,
    };
    // The port's allow-list is the last gate: nothing off it reaches the Inbox.
    const served = checkInboxStepperRequest(stepper);
    if (!served.ok) return unreadable(served.problems);
    return { kind: "readable", stepper: served.request, validated: checked.value };
  }

  /** Whether task `task`'s request has a revision newer than `revision`; a deleted one counts as changed. */
  async changedSince(task: string, revision: string): Promise<boolean> {
    const answer = await this.#reader.send("latestStepperRequest", { path: { task } });
    if (answer.kind === "failed" && answer.failure === "not-found") return true;
    const latest = text(asRecord(bodyOf("latestStepperRequest", answer)), "latestRevisionId");
    return latest !== revision;
  }

  /**
   * Card `record`'s item `item` as a stepper item when it is open and pins a
   * request: options gone, the request on it, kind `action`. A request that
   * can't be read leaves a normal card that says why, so the agent can fix it.
   */
  async serve(task: string, record: JsonRecord, item: InboxItem): Promise<InboxItem> {
    const revision = pinnedRevision(record);
    if (revision === undefined || item.state.kind !== "open") return item;
    // An item runs one request: a definition or a stepper, never both at once.
    const pinned: PinnedStepper =
      item.action === undefined
        ? await this.read(task, revision)
        : { kind: "unreadable", reason: "the card already names an action" };
    if (pinned.kind === "readable") {
      // The card's own kind (an approval for a confirmation) would no longer fit an action item.
      return { ...item, kind: "action", options: [], stepper: pinned.stepper };
    }
    return {
      ...item,
      question: `${item.question}\n\nThis card has a stepper Halonic can't read: ${pinned.reason}`,
    };
  }

  /**
   * `items` with `changed` read again for every open stepper item. Paperclip
   * doesn't touch a task when one of its documents changes, so the cards read
   * when the task last changed can't tell.
   */
  async refresh(
    items: readonly InboxItem[],
    taskOf: (item: InboxItem) => string | undefined,
  ): Promise<InboxItem[]> {
    const refreshed: InboxItem[] = [];
    for (const item of items) {
      const task = taskOf(item);
      if (item.stepper === undefined || item.state.kind !== "open" || task === undefined) {
        refreshed.push(item);
        continue;
      }
      const changed = await this.changedSince(task, item.stepper.revision);
      refreshed.push({ ...item, stepper: { ...item.stepper, changed } });
    }
    return refreshed;
  }

  /**
   * Writes `markdown` as task `task`'s document `stepper-result`: as a new
   * document, or on a conflict over the revision Paperclip names, so no
   * other read is needed. Answers the failure of the write, if it failed.
   */
  async writeResult(task: string, markdown: string): Promise<PaperclipAnswer> {
    const write = (baseRevisionId: string | null) =>
      this.#reader.send("writeStepperResult", {
        path: { task },
        body: { title: "Stepper result", format: "markdown", body: markdown, baseRevisionId },
      });
    const first = await write(null);
    if (first.kind === "failed" && first.failure === "conflict" && first.currentRevisionId) {
      return write(first.currentRevisionId);
    }
    return first;
  }
}
