import type { MessagingSync } from "@halonicjs/ports";
import type { LiveEvent } from "./live-messages.ts";

/** The name of one of the collections the local copy keeps. */
export type SyncCollectionName = keyof MessagingSync;

/** Everything a task's change can touch: its chat, its cards and the work list. */
const taskCollections: readonly SyncCollectionName[] = ["conversations", "inbox", "work"];

/**
 * Event types outside `activity.logged` that change the local copy: an agent's status changes the
 * agents list, and a run that starts or ends changes whether a chat's agent is working.
 * `heartbeat.run.activity` (once a second per run), run logs and plugin events change nothing
 * we keep, so they bring no read.
 */
const otherTouches: Readonly<Record<string, readonly SyncCollectionName[]>> = {
  "agent.status": ["agents"],
  "heartbeat.run.queued": ["conversations"],
  "heartbeat.run.status": ["conversations"],
};

/**
 * The collections of the local copy a live event touches, or none for one that changes nothing
 * the copy keeps (requirement `agent-host.paperclip-live-events`). An event only says which
 * record changed: the collections are then read again over the normal HTTP routes.
 *
 * Any activity on a task (a comment, a card, a status) touches its chat, the Inbox and the work
 * list; on an agent, the agents list; any other activity, such as an approval, a decision, a
 * secret proposal or a join request, the Inbox, where those show.
 */
export function touchedBy(event: LiveEvent): readonly SyncCollectionName[] {
  if (event.kind === "other") return otherTouches[event.type] ?? [];
  if (event.entityType === "issue") return taskCollections;
  if (event.entityType === "agent") return ["agents"];
  return ["inbox"];
}
