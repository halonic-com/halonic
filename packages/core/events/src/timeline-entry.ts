import type { RunEvent, RunEventType } from "./run-event.ts";

/** How an event that updates an entry finds the event that opened it. */
interface EntryUpdate {
  /** The type of the opening event. */
  opener: RunEventType;
  /** The fields the opener must have the same values for, in {@link openerFields} order. */
  fields: unknown[];
  /** Whether the entry is finished after this event, so later events can't update it. */
  closes: boolean;
}

/**
 * The timeline entry of each event of a run log: the `seq` of the event that
 * opened the entry. An event that has `entry` keeps it. For a log written
 * before the field existed, an event that finishes or updates an entry (such
 * as `agent.finished`) gets the `seq` of the latest still-open event that
 * opened it, with the same branch, item and matching fields; every other
 * event opens an entry of its own. The engine writes `entry` by the same
 * rules, so an old log and a new log of the same run give the same entries.
 *
 * @param events - one run's log, in `seq` order
 * @returns the entry of each event, in the same order as `events`
 *
 * @example
 * entryOf([
 *   { seq: 1, type: "agent.started", state: "s", agent: "a", ... },
 *   { seq: 2, type: "agent.finished", state: "s", agent: "a", ... },
 * ]);
 * // => [1, 1]
 */
export function entryOf(events: readonly RunEvent[]): number[] {
  // The entries still open, by opener key; the latest is last.
  const open = new Map<string, number[]>();
  return events.map((event) => {
    const fields = openerFields(event);
    if (fields !== null) {
      const entry = event.entry ?? event.seq;
      const key = entryKey(event, event.type, fields);
      open.set(key, [...(open.get(key) ?? []), entry]);
      return entry;
    }
    const update = updateOf(event);
    if (update === null) return event.entry ?? event.seq;
    const openEntries = open.get(entryKey(event, update.opener, update.fields)) ?? [];
    const entry = event.entry ?? openEntries.at(-1) ?? event.seq;
    const index = openEntries.lastIndexOf(entry);
    if (update.closes && index !== -1) openEntries.splice(index, 1);
    return entry;
  });
}

/** The key of an entry: its opener's type, branch, item and matched fields. */
function entryKey(event: RunEvent, opener: RunEventType, fields: unknown[]): string {
  // JSON keeps `undefined` apart from every string, as `null` in an array.
  return JSON.stringify([opener, event.branch, event.item, ...fields]);
}

/**
 * The fields an opening event is matched on, or `null` when the event doesn't
 * open an entry that later events update.
 */
function openerFields(event: RunEvent): unknown[] | null {
  switch (event.type) {
    case "run.started":
    case "run.waiting":
      return [];
    case "state.entered":
      return [event.state];
    case "agent.started":
      return [event.state, event.agent, event.parent];
    case "llm.request":
      return [event.agent];
    case "tool.called":
      return [event.agent, event.tool];
    case "approval.requested":
      return [event.callId];
    case "workflow.started":
      return [event.childRunId];
    default:
      return null;
  }
}

/** Which entry an event updates, or `null` when it doesn't update one. */
function updateOf(event: RunEvent): EntryUpdate | null {
  switch (event.type) {
    case "run.completed":
    case "run.failed":
    case "run.cant-try":
      return { opener: "run.started", fields: [], closes: true };
    case "transition":
      return { opener: "state.entered", fields: [event.from], closes: true };
    case "agent.finished":
      return {
        opener: "agent.started",
        fields: [event.state, event.agent, event.parent],
        closes: true,
      };
    case "llm.response":
      return { opener: "llm.request", fields: [event.agent], closes: true };
    // The call goes on with the fallback model, so its response still follows.
    case "llm.fallback":
      return { opener: "llm.request", fields: [event.agent], closes: false };
    case "tool.result":
      return { opener: "tool.called", fields: [event.agent, event.tool], closes: true };
    case "approval.resolved":
      return { opener: "approval.requested", fields: [event.callId], closes: true };
    case "workflow.finished":
      return { opener: "workflow.started", fields: [event.childRunId], closes: true };
    // Only while the run waits; otherwise no entry is open and it stands alone.
    case "timer.fired":
    case "event.received":
    case "workflow.resumed":
      return { opener: "run.waiting", fields: [], closes: true };
    default:
      return null;
  }
}
