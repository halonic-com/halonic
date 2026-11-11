import type { ToolNoun, ToolVerb } from "./run-basics.ts";
import type { RunEvent } from "./run-event.ts";

/** How many calls did one verb to one noun, such as 2 calls that sent an email. */
export interface SendCount {
  noun: ToolNoun;
  calls: number;
}

/**
 * What one verb did, noun by noun, in the order of each noun's first call:
 * "sent" with 1 email and 2 invites reads "sent 1 email and 2 invites".
 */
export interface SendGroup {
  verb: ToolVerb;
  counts: SendCount[];
}

/** What a run sent, worked out from its log by {@link sendsOf}. */
export interface RunSends {
  /** The calls that sent, one group per verb, in the order of each verb's first call. */
  sent: SendGroup[];
  /** The calls that broke off without an answer, so may have sent; grouped the same way. */
  maySend: SendGroup[];
  /**
   * Whether the run made a tool call at all. A run "sent nothing" only when
   * it made none: a call whose log doesn't say what it can do may have sent.
   * Starting a child run counts as a call, because the child may have sent.
   */
  madeToolCalls: boolean;
}

/**
 * What a run sent, by the reader rules of requirement
 * `events.tool-result-risk`. Pure; the receipt and the runs list both use it,
 * so they say the same thing about a run.
 *
 * A call counts as sent when its `tool.result` has `risk: "send"`, a `noun`
 * and `outcome: "ok"`, and as "may have sent" with `outcome: "unknown"`. A
 * missing `verb` is "sent". Groups and the counts in them keep call order.
 *
 * @param events - the run's events, oldest first
 * @returns what it sent, what it may have sent, and whether it made a tool call
 *
 * @example
 * const { sent } = sendsOf(await runStore.events(runId));
 * // gmail_send, calendar_create_event twice, drive_create_file =>
 * // [{ verb: "sent", counts: [1 email, 2 invites] }, { verb: "saved", counts: [1 file] }]
 */
export function sendsOf(events: readonly RunEvent[]): RunSends {
  const sends: RunSends = { sent: [], maySend: [], madeToolCalls: false };
  for (const event of events) {
    if (!couldSend(event)) continue;
    sends.madeToolCalls = true;
    if (event.type !== "tool.result" || event.risk !== "send" || event.noun === undefined) {
      continue;
    }
    const verb = event.verb ?? "sent";
    if (event.outcome === "ok") addCall(sends.sent, verb, event.noun);
    if (event.outcome === "unknown") addCall(sends.maySend, verb, event.noun);
  }
  return sends;
}

/**
 * Whether the event is a call that could have sent something: a tool call, or
 * a child run started, whose own log holds what it sent.
 */
function couldSend(event: RunEvent): boolean {
  return (
    event.type === "tool.called" ||
    event.type === "tool.result" ||
    event.type === "workflow.started"
  );
}

/** Count one call in its verb's group, adding the group or the noun at the end when new. */
function addCall(groups: SendGroup[], verb: ToolVerb, noun: ToolNoun): void {
  let group = groups.find((candidate) => candidate.verb === verb);
  if (group === undefined) {
    group = { verb, counts: [] };
    groups.push(group);
  }
  const count = group.counts.find((candidate) => sameNoun(candidate.noun, noun));
  if (count === undefined) {
    group.counts.push({ noun: { one: noun.one, many: noun.many }, calls: 1 });
  } else {
    count.calls += 1;
  }
}

function sameNoun(a: ToolNoun, b: ToolNoun): boolean {
  return a.one === b.one && a.many === b.many;
}
