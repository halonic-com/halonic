import {
  type Message,
  type MessageWork,
  type MessagingAgent,
  type MessagingId,
  messageWorkReasonMax,
} from "@halonicjs/ports";
import { clockTime } from "@halonicjs/studio-kit";
import { channelWords } from "./channel-words.ts";
import type { ConversationRow } from "./messenger.ts";

/**
 * A channel's rules that don't need the port: who the box sends to, the `@` picker, and the work
 * lines under the person's messages (requirements `messenger.channel-authority` and
 * `messenger.channel-messages`). Who a message goes to comes only from the person's picks, never
 * from its text: a typed `@Liam` that wasn't picked stays text and names nobody.
 */

/** Whether a conversation is a channel: several agents, one of them its lead. */
export function isChannel(row: ConversationRow): boolean {
  return row.conversation.members !== undefined;
}

/** The channel's lead, or a direct chat's agent; none once that agent left the source. */
export function leadOf(row: ConversationRow): MessagingAgent | undefined {
  return row.agents.find((agent) => agent.id === row.conversation.agent);
}

/**
 * An agent's name as its source lists it, member of the channel or not; none when the source no
 * longer lists it. Never a name a message carries (requirement `messenger.author-from-source`).
 */
export function agentName(row: ConversationRow, id: MessagingId): string | undefined {
  return row.sourceAgents.find((agent) => agent.id === id)?.name;
}

/**
 * An agent's name as its source lists it, or else that it is gone: "No longer in" and the source's
 * label, or "No longer listed" when the source itself is gone too.
 */
export function memberName(row: ConversationRow, id: MessagingId): string {
  const name = agentName(row, id);
  if (name !== undefined) return name;
  return row.source === undefined
    ? channelWords.authorGoneNoSource
    : channelWords.authorGone(row.source.label);
}

/** What the To line says, and whether Send may send to it (flow I, K2). */
export interface ToLine {
  readonly text: string;
  /** Why Send waits: a channel without a lead, and nobody named. */
  readonly waits?: string;
}

/** The To line for the agents the person named: those, or else the lead. */
export function toLine(row: ConversationRow, named: readonly MessagingId[]): ToLine {
  const names = named.flatMap((id) => agentName(row, id) ?? []);
  if (names.length > 0) return { text: channelWords.to(names) };
  const lead = leadOf(row);
  if (lead === undefined) return { text: channelWords.toNobody, waits: channelWords.noLead };
  return { text: channelWords.toLead(lead.name) };
}

const typedName = /(?:^|\s)@([^\s@]*)$/u;

/** The name being typed after an `@` at the end of the box, or none: the picker is closed. */
export function pickerQuery(draft: string): string | undefined {
  return typedName.exec(draft)?.[1];
}

/** The box's text with the `@` and the name being typed taken off, once the person picked one. */
export function withoutQuery(draft: string): string {
  return draft.replace(/@[^\s@]*$/u, "");
}

/** The members the picker offers for `query`: not named yet, whose name holds it. */
export function pickable(
  row: ConversationRow,
  query: string,
  named: readonly MessagingId[],
): readonly MessagingAgent[] {
  const wanted = query.toLowerCase();
  return row.agents.filter(
    (agent) => !named.includes(agent.id) && agent.name.toLowerCase().includes(wanted),
  );
}

/**
 * What a work line says about the work, which picks its icon and tone: `running` while it starts
 * or works, then `answered`, `asks-you`, `failed`, `passed-on`, or `limit` once it stopped after
 * the hand-off limit (k11b).
 */
export type WorkLineKind = "running" | "answered" | "asks-you" | "failed" | "passed-on" | "limit";

/** One work line: an icon and words, never colour alone (flow J). */
export interface WorkLine {
  readonly kind: WorkLineKind;
  readonly text: string;
  /** For a line that ended without an answer: the agent **Ask again** sends the message to. */
  readonly askAgain?: MessagingId;
}

/** The hand-offs after which a message stops being passed on (K3). */
const handOffLimit = 3;

/**
 * The work lines under one of the person's messages, one per agent it went to, then the
 * hand-off limit's line once it was passed on 3 times. A state the source couldn't map, an agent
 * the source no longer lists, and a hand-off to no known agent show no line. `questions` gives an
 * open question's text by the work it belongs to.
 */
export function workLines(
  message: Message,
  row: ConversationRow,
  questions: ReadonlyMap<MessagingId, string>,
  now: Date,
): readonly WorkLine[] {
  const work = message.work ?? [];
  const lines = work.flatMap((share) => lineOf(share, row, questions, now) ?? []);
  const handOffs = work.filter((share) => share.state === "passed-on").length;
  if (handOffs >= handOffLimit) lines.push({ kind: "limit", text: channelWords.work.handOffLimit });
  return lines;
}

function lineOf(
  share: MessageWork,
  row: ConversationRow,
  questions: ReadonlyMap<MessagingId, string>,
  now: Date,
): WorkLine | undefined {
  const agent = agentName(row, share.agent);
  if (agent === undefined) return undefined;
  const words = channelWords.work;
  switch (share.state) {
    case "starting":
      return { kind: "running", text: words.starting(agent) };
    case "working":
      return { kind: "running", text: workingText(agent, share, row, now) };
    case "answered":
      return { kind: "answered", text: words.answered(agent) };
    case "asks-you": {
      const question = share.work === undefined ? undefined : questions.get(share.work);
      return { kind: "asks-you", text: words.asksYou(agent, question) };
    }
    case "failed": {
      const reason = shownReason(share.reason);
      const text = reason === undefined ? words.closed(agent) : words.couldntFinish(agent, reason);
      return { kind: "failed", text, askAgain: share.agent };
    }
    case "passed-on": {
      const to = share.passedTo === undefined ? undefined : agentName(row, share.passedTo);
      return to === undefined ? undefined : { kind: "passed-on", text: words.passedOn(agent, to) };
    }
    default:
      return undefined;
  }
}

/**
 * How long an agent has been working, or, while its source is offline, as of when the source was
 * last read: the minutes would keep counting with nothing to say the work still goes on.
 */
function workingText(agent: string, share: MessageWork, row: ConversationRow, now: Date): string {
  const state = row.source?.state;
  if (state?.kind === "offline") {
    return channelWords.work.stale(agent, clockTime(new Date(state.asOf), now));
  }
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(share.since)) / 60_000));
  return channelWords.work.working(agent, minutes);
}

/**
 * A failed line's reason as one line of plain text, cut to the port's cap; none when the source
 * gave none or only spaces. The source wrote it, so it is never read as Markdown.
 */
function shownReason(reason: string | undefined): string | undefined {
  const line = reason?.replace(/\s+/gu, " ").trim();
  if (line === undefined || line === "") return undefined;
  if (line.length <= messageWorkReasonMax) return line;
  return `${line.slice(0, messageWorkReasonMax - 1)}…`;
}

/** A channel row's size: "3 agents", counting members its source no longer lists too. */
export function channelSize(row: ConversationRow): string {
  return channelWords.row.size((row.conversation.members ?? []).length);
}

/** "2 working · Elena, Liam" or "1 working · Elena" while members are working; else nothing. */
export function workingMembers(row: ConversationRow): string | undefined {
  const working = row.agents.filter((agent) => agent.activity === "working");
  if (working.length === 0) return undefined;
  return channelWords.row.working(working.map((agent) => agent.name));
}

/** The source's agent whose name holds `query` but who isn't a member, for the picker's **Add**. */
export function outsider(row: ConversationRow, query: string): MessagingAgent | undefined {
  const wanted = query.toLowerCase();
  if (wanted === "") return undefined;
  const members = row.conversation.members ?? [row.conversation.agent];
  return row.sourceAgents.find(
    (agent) => !members.includes(agent.id) && agent.name.toLowerCase().includes(wanted),
  );
}
