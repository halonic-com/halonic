/**
 * Reads a stored stepper request (`InboxItem.stepper`, such as a Paperclip card pinned to its
 * `stepper-request` document) as the action item the review already knows
 * (`action-steppers.stepper-items`). For now only a request of one `use` block reads: it names
 * one whole reviewed stepper and its parameters, as an action item does, and runs as one.
 */
import { requestExpiresAt, splitReference, stepperRequestSchema } from "@halonicjs/action-steppers";
import type { InboxItem } from "@halonicjs/ports";
import { parse } from "@halonicjs/schema-kit";
import type { ActionItem } from "./action-item-review.ts";

/** Why a stored request can't open as a stepper here, as the card lists it. */
export const stepperItemReasons = {
  changed: "it changed after the agent made this card",
  unreadable: "its request document can't be read",
  notOneStepper: "this version of Halonic opens only a request for one whole stepper",
} as const;

/**
 * How an Inbox item opens: as an action item for the stepper, or as a card that says why it can't.
 * `perBlock` is `true` for a stored stepper request: its result is written per block, so the run's
 * answer goes through `blockAnswer` first.
 */
export type ActionItemRead =
  | { readonly kind: "action"; readonly item: ActionItem; readonly perBlock: boolean }
  | { readonly kind: "unreadable"; readonly reasons: readonly string[] };

/**
 * The item as the stepper opens it, or `undefined` when it isn't an action item. An item with
 * `action` opens as it is. An item with `stepper` opens as its one `use` block's definition, with
 * the default lifetime counted from when the item was made, since the document names no expiry.
 *
 * A stored request of exactly one `server-session` block returns `undefined` too: it isn't a
 * stepper, so the Inbox opens it as its card with **Run with Claude** (`inbox.run-with-claude`).
 * The request format takes a `server-session` block only alone, so one next to any other block
 * doesn't parse, and the item says its request document can't be read.
 *
 * @example
 * actionItemOf(item); // { kind: "action", item: { ...item, action: { definition: "github.upload-social-preview", … } }, perBlock: true }
 */
export function actionItemOf(item: InboxItem): ActionItemRead | undefined {
  if (item.action !== undefined) {
    return { kind: "action", item: { ...item, action: item.action }, perBlock: false };
  }
  const { stepper, ...rest } = item;
  if (stepper === undefined) return undefined;
  if (stepper.changed) return unreadable(stepperItemReasons.changed);
  const request = parsedRequest(stepper.document);
  if (request === undefined) return unreadable(stepperItemReasons.unreadable);
  const [block, ...others] = request.blocks;
  if (block?.kind === "server-session" && others.length === 0) return undefined;
  if (block?.kind !== "use" || others.length > 0) {
    return unreadable(stepperItemReasons.notOneStepper);
  }
  const { id, version } = splitReference(block.ref);
  const action = {
    definition: id,
    version,
    parameters: block.parameters,
    expires: expiresOf(item),
  };
  return { kind: "action", item: { ...rest, action }, perBlock: true };
}

function unreadable(reason: string): ActionItemRead {
  return { kind: "unreadable", reasons: [reason] };
}

/** The document parsed against the request schema; `undefined` when it isn't JSON or doesn't fit. */
function parsedRequest(document: string) {
  let json: unknown;
  try {
    json = JSON.parse(document);
  } catch {
    // The provider checked the document already; one that still fails reads as unreadable.
    return undefined;
  }
  const parsed = parse(stepperRequestSchema, json);
  return parsed.ok ? parsed.value : undefined;
}

/** 24 hours after the item was made; an empty expiry, which the review refuses, when that isn't a time. */
function expiresOf(item: InboxItem): string {
  const receivedAt = Date.parse(item.createdAt);
  if (Number.isNaN(receivedAt)) return "";
  return new Date(requestExpiresAt({ receivedAt })).toISOString();
}
