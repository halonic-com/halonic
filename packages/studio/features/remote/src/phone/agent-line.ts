/**
 * What one row of the phone's Agents list says under the agent's name (`s-m2`, `s-m3` on
 * HAL-12206): its state in a word, and a line from the newest thing the phone knows of it. While
 * the view is stale, the line ends with "as of {asOf}" (design decision 6), so the phone never
 * claims more than it knows.
 */

import { type HostText, hostAppend, hostLineMax, hostLineParts, hostPlain } from "./host-text.ts";
import { asOfText } from "./phone-forms.ts";
import type { RemoteApproval, RemoteSession, RemoteView } from "./remote-view.ts";

/** A session's state in a word; the chip's colour never says it alone. */
export const agentStateWords: Record<RemoteSession["state"], string> = {
  running: "Running",
  waiting: "Needs you",
  done: "Done",
  failed: "Failed",
};

/**
 * The row's line, before any "as of": for a session that ended, when ("Finished 13:40",
 * "Failed yesterday 09:12"); else what its oldest open approval asks; else the agent's newest
 * message. `undefined` when the phone holds none of these, as for a session it doesn't watch.
 * The computer's text in it shows its hidden characters and is cut with "…" (`hostLineParts`).
 */
export function agentLine(
  session: RemoteSession,
  approval: RemoteApproval | undefined,
  now: Date,
): HostText | undefined {
  if (hasEnded(session)) {
    const ended = new Date(session.updatedAt);
    if (Number.isNaN(ended.getTime())) return hostPlain(agentStateWords[session.state]);
    const verb = session.state === "done" ? "Finished" : "Failed";
    return hostPlain(`${verb} ${asOfText(ended, now)}`);
  }
  if (approval !== undefined) return hostLineParts(approval.approval.summary, hostLineMax);
  for (let index = session.events.length - 1; index >= 0; index--) {
    const body = session.events[index]?.body;
    if (body?.type !== "message" || body.role !== "agent") continue;
    const line = firstLine(body.text);
    return line === undefined ? undefined : hostLineParts(line, hostLineMax);
  }
  return undefined;
}

/**
 * The line the row shows: {@link agentLine}, and while `view` is stale, " · as of 14:02" after it
 * ("as of 14:02" alone when there's no line). A live view, or one with nothing yet, adds nothing,
 * and neither does an agent that ended: "Failed yesterday 09:12" can't go out of date, and a
 * second time next to it read as two dates (C672).
 */
export function agentRowLine(
  view: RemoteView,
  session: RemoteSession,
  approval: RemoteApproval | undefined,
  now: Date,
): HostText | undefined {
  const line = agentLine(session, approval, now);
  if (view.canAnswer || view.asOf === undefined || hasEnded(session)) return line;
  const asOf = `as of ${asOfText(view.asOf, now)}`;
  return line === undefined ? hostPlain(asOf) : hostAppend(line, ` · ${asOf}`);
}

function hasEnded(session: RemoteSession): boolean {
  return session.state === "done" || session.state === "failed";
}

/** The oldest open approval of `session`; `openApprovals` is oldest first. */
export function oldestApprovalOf(view: RemoteView, sessionId: string): RemoteApproval | undefined {
  return view.openApprovals.find((each) => each.sessionId === sessionId);
}

/** A message's first non-empty line, so one long reply doesn't fill the row. */
function firstLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((each) => each.trim())
    .find((each) => each.length > 0);
}
