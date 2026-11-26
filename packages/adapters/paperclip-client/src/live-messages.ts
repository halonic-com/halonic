import { asRecord, field, text } from "./json.ts";
import { isSafeSegment } from "./requests.ts";

/**
 * One live event from Paperclip, cut down to what says which record changed.
 * `activity` is `activity.logged`, such as a new comment (`issue.comment_added`
 * on a task) or a card; every other type keeps only its name, since its payload
 * can carry run logs we never need. The record itself is read again over the
 * normal, permission-checked HTTP routes.
 */
export type LiveEvent =
  | {
      kind: "activity";
      action: string;
      entityType: string;
      entityId: string;
      createdAt: string;
    }
  | { kind: "other"; type: string; createdAt: string };

/** What a text frame said: an event, or `resync` (Paperclip dropped events, so read again). */
export type LiveMessage = { kind: "event"; event: LiveEvent } | { kind: "resync" };

/** Names Paperclip gives event types and actions, such as `heartbeat.run.status`. */
const namePattern = /^[a-z][a-z0-9_.]{0,99}$/i;

/**
 * The message in a text frame's JSON for company `company`, or `undefined`
 * for one to skip: a control message other than `live.resync`, another
 * company's event, or one whose fields aren't the plain names and IDs they
 * should be. Nothing of a payload but the activity's three names is kept.
 */
export function liveMessageOf(body: unknown, company: string): LiveMessage | undefined {
  const record = asRecord(body);
  const type = text(record, "type");
  if (type === undefined || !namePattern.test(type)) return undefined;
  if (type === "live.resync") return { kind: "resync" };
  const createdAt = text(record, "createdAt");
  if (type.startsWith("live.") || createdAt === undefined || createdAt.length > 40) {
    return undefined;
  }
  if (text(record, "companyId") !== company) return undefined;
  if (type !== "activity.logged")
    return { kind: "event", event: { kind: "other", type, createdAt } };
  const payload = asRecord(field(record, "payload"));
  const action = text(payload, "action");
  const entityType = text(payload, "entityType");
  const entityId = text(payload, "entityId");
  if (
    action === undefined ||
    entityType === undefined ||
    entityId === undefined ||
    !namePattern.test(action) ||
    !namePattern.test(entityType) ||
    !isSafeSegment(entityId) ||
    entityId.length > 128
  ) {
    return undefined;
  }
  return { kind: "event", event: { kind: "activity", action, entityType, entityId, createdAt } };
}
