// A stepper request on an action Inbox item (`ports.agent-messaging-steppers`,
// architecture note on HAL-17491, 7.2). A source that stores the request as a
// document, as Paperclip does, hands Studio the exact revision the card pinned.
// The document is the requester's text, so the item carries it as text: Studio
// validates it again before it shows a preview and before each step.

/** The format of a stepper request document. `core/action-steppers` owns the schema; ports can't import it. */
export const inboxStepperFormat = "halonic.stepper-request/1";

/** The largest request document, in UTF-8 bytes, as the format allows. */
export const maxInboxStepperBytes = 16 * 1024;

/** The most blocks a request may list, so the most touches an item may carry. */
export const maxInboxStepperBlocks = 20;

/** The most targets one block's touches may list. */
const maxTargets = 20;

/** The longest revision id or target text taken. */
const maxTextLength = 200;

/** A request's risk levels, from lowest to highest, as `core/action-steppers` names them. */
export const inboxStepperRisks = ["routine", "admin", "irreversible"] as const;

/** Something one block touches, such as GitHub repository `acme/app`. */
export interface InboxStepperTarget {
  service: string;
  kind: string;
  name: string;
}

/** What one block touches and its risk, numbered from 1 as the preview shows it. */
export interface InboxStepperTouch {
  block: number;
  risk: (typeof inboxStepperRisks)[number];
  targets: readonly InboxStepperTarget[];
}

/**
 * A request to run a stepper on demand, as an action item carries it. The
 * provider read `document` at the revision the source pinned and checked it
 * with the validator, so `touches` is early feedback for the list; only
 * Studio's own check decides. When `changed` is true the source has a newer
 * revision: the item shows "The request changed after this card was made" and
 * can't run. An `action-result` answer to it numbers its steps by block.
 */
export interface InboxStepperRequest {
  format: typeof inboxStepperFormat;
  /** The pinned revision's text: `halonic.stepper-request/1` JSON, at most 16 KB. */
  document: string;
  /** The revision the source pinned, as the source names it. */
  revision: string;
  touches: readonly InboxStepperTouch[];
  changed: boolean;
}

/** What {@link checkInboxStepperRequest} found: the request, or every problem with it. */
export type InboxStepperCheck =
  | { ok: true; request: InboxStepperRequest }
  | { ok: false; problems: readonly string[] };

const requestFields = ["format", "document", "revision", "touches", "changed"];
const touchFields = ["block", "risk", "targets"];
const targetFields = ["service", "kind", "name"];

/**
 * Checks a value against the allow-list of a stepper request on an item
 * (requirement `ports.agent-messaging-steppers`). A provider runs it before
 * it serves the item, so a request with a field not on the list, a document
 * over 16 KB or touches that aren't plain text never reach the Inbox.
 *
 * @param value - a request a provider built from what its source stored
 * @returns the request, or the problems; a problem names the field, never its value
 *
 * @example
 * checkInboxStepperRequest({ ...request, script: "rm -rf" });
 * // => { ok: false, problems: ["script: not allowed"] }
 */
export function checkInboxStepperRequest(value: unknown): InboxStepperCheck {
  if (!isRecord(value)) return { ok: false, problems: ["a stepper request is a JSON object"] };
  const problems = unlistedFields(value, requestFields, "");
  if (value["format"] !== inboxStepperFormat) problems.push("format: not allowed");
  const document = value["document"];
  if (typeof document !== "string" || document === "") problems.push("document: not a text");
  else if (utf8Length(document) > maxInboxStepperBytes) problems.push("document: over 16 KB");
  if (!isShortText(value["revision"])) problems.push("revision: not a text");
  if (typeof value["changed"] !== "boolean") problems.push("changed: not true or false");
  problems.push(...touchesProblems(value["touches"]));
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, request: value as unknown as InboxStepperRequest };
}

function touchesProblems(touches: unknown): string[] {
  if (!Array.isArray(touches)) return ["touches: not a list"];
  if (touches.length > maxInboxStepperBlocks) {
    return [`touches: more than ${maxInboxStepperBlocks}`];
  }
  return touches.flatMap((touch, index) => touchProblems(touch, `touches.${index}.`));
}

function touchProblems(value: unknown, at: string): string[] {
  if (!isRecord(value)) return [`${at.slice(0, -1)}: not an object`];
  const problems = unlistedFields(value, touchFields, at);
  const block = value["block"];
  const isBlock = typeof block === "number" && Number.isInteger(block);
  if (!isBlock || block < 1 || block > maxInboxStepperBlocks) {
    problems.push(`${at}block: not a block number`);
  }
  if (!(inboxStepperRisks as readonly unknown[]).includes(value["risk"])) {
    problems.push(`${at}risk: not allowed`);
  }
  const targets = value["targets"];
  if (!Array.isArray(targets) || targets.length > maxTargets) {
    problems.push(`${at}targets: not a list of at most ${maxTargets}`);
    return problems;
  }
  targets.forEach((target, index) => {
    const where = `${at}targets.${index}`;
    if (!isRecord(target)) problems.push(`${where}: not an object`);
    else if (unlistedFields(target, targetFields, "").length > 0) {
      problems.push(`${where}: a field not allowed`);
    } else if (!targetFields.every((field) => isShortText(target[field]))) {
      problems.push(`${where}: not plain text`);
    }
  });
  return problems;
}

/** A non-empty text of at most 200 characters with no control characters. */
function isShortText(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value !== "" &&
    value.length <= maxTextLength &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

/** The text's length in UTF-8 bytes, counted without an encoder so the port stays free of runtime APIs. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** A problem for each key not on the list, named but cut short, since a key can be anything. */
function unlistedFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  at: string,
): string[] {
  return Object.keys(value)
    .filter((key) => !allowed.includes(key))
    .map((key) => `${at}${key.slice(0, 64)}: not allowed`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
