import type { Message, MessageWork, MessagingAgent, MessagingId } from "@halonicjs/ports";
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

/** What the To line says, and whether Send may send to it (flow I, K2). */
export interface ToLine {
  readonly text: string;
  /** Why Send waits: a channel without a lead, and nobody named. */
  readonly waits?: string;
}

/** The To line for the agents the person named: those, or else the lead. */
export function toLine(row: ConversationRow, named: readonly MessagingId[]): ToLine {
  const names = named.map((id) => nameOf(row.agents, id));
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

/** One work line: a symbol and words, never colour alone (flow J). */
export interface WorkLine {
  readonly symbol: string;
  readonly text: string;
}

/** The hand-offs after which a message stops being passed on (K3). */
const handOffLimit = 3;

/**
 * The work lines under one of the person's messages, one per agent it went to, then the
 * hand-off limit's line once it was passed on 3 times. A state the source couldn't map shows no
 * line. `questions` gives an open question's text by the work it belongs to.
 */
export function workLines(
  message: Message,
  agents: readonly MessagingAgent[],
  questions: ReadonlyMap<MessagingId, string>,
  now: Date,
): readonly WorkLine[] {
  const work = message.work ?? [];
  const lines = work.flatMap((share) => lineOf(share, agents, questions, now) ?? []);
  const handOffs = work.filter((share) => share.state === "passed-on").length;
  if (handOffs >= handOffLimit) lines.push({ symbol: "✕", text: channelWords.work.handOffLimit });
  return lines;
}

function lineOf(
  share: MessageWork,
  agents: readonly MessagingAgent[],
  questions: ReadonlyMap<MessagingId, string>,
  now: Date,
): WorkLine | undefined {
  const agent = nameOf(agents, share.agent);
  const words = channelWords.work;
  switch (share.state) {
    case "starting":
      return { symbol: "◔", text: words.starting(agent) };
    case "working": {
      const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(share.since)) / 60_000));
      return { symbol: "◔", text: words.working(agent, minutes) };
    }
    case "answered":
      return { symbol: "✓", text: words.answered(agent) };
    case "asks-you": {
      const question = share.work === undefined ? undefined : questions.get(share.work);
      return { symbol: "!", text: words.asksYou(agent, question) };
    }
    case "failed":
      return { symbol: "✕", text: words.closed(agent) };
    case "passed-on":
      return { symbol: "→", text: words.passedOn(agent, nameOf(agents, share.passedTo ?? "")) };
    default:
      return undefined;
  }
}

function nameOf(agents: readonly MessagingAgent[], id: MessagingId): string {
  return agents.find((agent) => agent.id === id)?.name ?? "";
}
