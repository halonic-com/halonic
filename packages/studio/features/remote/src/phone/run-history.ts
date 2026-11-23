/**
 * What the phone's run detail shows of one agent, top to bottom (drawing on HAL-16169): its
 * messages and approvals in the order they happened, each with the computer's time, then how the
 * agent stands. Pure, so the screen only draws it. The computer's text in it is data: hidden
 * characters show as markers, and a summary is cut with "…" (`host-text.ts`).
 */

import { agentLine } from "./agent-line.ts";
import { hostLine, hostLineMax, hostMessage, hostTitle } from "./host-text.ts";
import { asOfText } from "./phone-forms.ts";
import type { RemoteApproval, RemoteEvent, RemoteSession, RemoteView } from "./remote-view.ts";
import { runWords } from "./run-words.ts";

/** One item of the history. `time` is the computer's time, as "as of" writes it. */
export type RunItem =
  /** First, once the phone dropped older events. */
  | { readonly kind: "dropped"; readonly key: string }
  /** The phone holds nothing of the agent, and nothing of it waits. */
  | { readonly kind: "nothing"; readonly key: string }
  | {
      readonly kind: "message";
      readonly key: string;
      readonly from: "you" | "agent";
      readonly text: string;
      readonly time: string | undefined;
    }
  /** An approval that still waits; the phone shows it and never answers it from here. */
  | {
      readonly kind: "waiting";
      readonly key: string;
      readonly summary: string;
      readonly time: string | undefined;
    }
  /** One quiet line: "Approved 13:53 · {summary}", or without the summary once it was dropped. */
  | {
      readonly kind: "answered";
      readonly key: string;
      readonly decision: "approve" | "deny";
      readonly text: string;
    }
  /** Last: the agent runs (`working`, with the spinner, only while live) or how it ended. */
  | { readonly kind: "working"; readonly key: string; readonly text: string }
  | {
      readonly kind: "ended";
      readonly key: string;
      readonly tone: "plain" | "danger";
      readonly text: string;
    };

/**
 * The history of `session` in `view`. An answered approval stands where it was asked, with the
 * time it was answered. An open approval whose request the phone no longer holds comes after the
 * events. A waiting agent ends with its open approval; a running one with "{agent} is working…"
 * while live, or "Working as of 14:02." while stale; one that ended with when.
 */
export function runHistory(view: RemoteView, session: RemoteSession, now: Date): RunItem[] {
  const open = new Map(
    view.openApprovals
      .filter((each) => each.sessionId === session.id)
      .map((each) => [each.approval.id, each]),
  );
  const items: RunItem[] = session.droppedOlder ? [{ kind: "dropped", key: "dropped" }] : [];
  const held = heldAnswers(session.events);
  for (const event of session.events) {
    const item = eventItem(event, held, open, now);
    if (item !== undefined) items.push(item);
  }
  for (const [id, waiting] of open) {
    if (!held.asked.has(id)) items.push(waitingItem(waiting, now));
  }
  if (session.events.length === 0 && open.size === 0) {
    items.push({ kind: "nothing", key: "nothing" });
  }
  const end = endOf(view, session, now);
  if (end !== undefined) items.push(end);
  return items;
}

/** Which approvals the held events ask, and the event that settled each one answered. */
interface HeldAnswers {
  readonly asked: ReadonlySet<string>;
  readonly settled: ReadonlyMap<string, RemoteEvent>;
}

function heldAnswers(events: readonly RemoteEvent[]): HeldAnswers {
  const asked = new Set<string>();
  const settled = new Map<string, RemoteEvent>();
  for (const event of events) {
    if (event.body.type === "approval-settled") settled.set(event.body.approvalId, event);
    if (event.body.type === "approval-requested") asked.add(event.body.approval.id);
  }
  return { asked, settled };
}

/**
 * The item one event shows: a message; an approval where it was asked, answered or waiting; an
 * answer whose request the phone no longer holds. None for a state change, which the end shows.
 */
function eventItem(
  event: RemoteEvent,
  held: HeldAnswers,
  open: ReadonlyMap<string, RemoteApproval>,
  now: Date,
): RunItem | undefined {
  const { body } = event;
  switch (body.type) {
    case "message":
      return {
        kind: "message",
        key: `event-${event.seq}`,
        from: body.role === "user" ? "you" : "agent",
        text: hostMessage(body.text),
        time: timeOf(event.at, now),
      };
    case "approval-requested": {
      const answer = held.settled.get(body.approval.id);
      if (answer !== undefined) return answered(answer, summaryOf(body.approval.summary), now);
      const waiting = open.get(body.approval.id);
      return waiting === undefined ? undefined : waitingItem(waiting, now);
    }
    case "approval-settled":
      return held.asked.has(body.approvalId) ? undefined : answered(event, undefined, now);
    case "state":
      return undefined;
  }
}

function waitingItem(open: RemoteApproval, now: Date): RunItem {
  return {
    kind: "waiting",
    key: `approval-${open.approval.id}`,
    summary: summaryOf(open.approval.summary),
    time: timeOf(open.requestedAt, now),
  };
}

/** An approval's `tool: {args}` summary as shown: hidden characters marked, cut with "…". */
function summaryOf(summary: string): string {
  return hostLine(summary, hostLineMax);
}

function answered(settled: RemoteEvent, summary: string | undefined, now: Date): RunItem {
  const decision = settled.body.type === "approval-settled" ? settled.body.decision : "approve";
  const time = timeOf(settled.at, now) ?? "";
  const said = (decision === "approve" ? runWords.approved : runWords.denied)(time).trimEnd();
  return {
    kind: "answered",
    key: `event-${settled.seq}`,
    decision,
    text: summary === undefined ? said : `${said} · ${summary}`,
  };
}

function endOf(view: RemoteView, session: RemoteSession, now: Date): RunItem | undefined {
  const key = "end";
  switch (session.state) {
    case "waiting":
      return undefined;
    case "running":
      if (view.canAnswer) {
        return { kind: "working", key, text: runWords.working(hostTitle(session.title)) };
      }
      if (view.asOf === undefined) return undefined;
      return {
        kind: "ended",
        key,
        tone: "plain",
        text: runWords.workingAsOf(asOfText(view.asOf, now)),
      };
    case "done":
      return { kind: "ended", key, tone: "plain", text: agentLine(session, undefined, now) ?? "" };
    case "failed": {
      const failed = agentLine(session, undefined, now) ?? "";
      return {
        kind: "ended",
        key,
        tone: "danger",
        text: `${failed}. ${runWords.failedSeeComputer}`,
      };
    }
  }
}

/** The computer's time of an event, as "as of" writes it; none when it isn't a time. */
function timeOf(at: string, now: Date): string | undefined {
  const moment = new Date(at);
  return Number.isNaN(moment.getTime()) ? undefined : asOfText(moment, now);
}
