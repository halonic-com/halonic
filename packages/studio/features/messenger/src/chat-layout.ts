import type { InboxItem, Message } from "@halonicjs/ports";
import type { TimelineEntry } from "./chat-timeline.ts";
import { messengerWords } from "./messenger-words.ts";

/** A message the person sent that is still on its way: it shows at once, "Sending…" under it. */
export interface PendingMessage {
  readonly key: number;
  readonly body: string;
  /** The names of the files sent with it, so a message of files only isn't an empty bubble. */
  readonly files?: readonly string[];
}

/** One line of the transcript as it shows: a day's label, a timeline entry, or a pending message. */
export type ChatLine =
  | { readonly kind: "day"; readonly key: string; readonly label: string }
  | {
      readonly kind: "message";
      readonly key: string;
      readonly message: Message;
      /** The first of a run by one agent or person: "Name · 13:58" and the picture show above it. */
      readonly head: boolean;
      /** It goes on the run of the message before it, so it sits close under that one. */
      readonly follows: boolean;
    }
  | { readonly kind: "card"; readonly key: string; readonly card: InboxItem }
  | {
      readonly kind: "pending";
      readonly key: string;
      readonly pending: PendingMessage;
      /** It goes on a run of the person's messages. */
      readonly follows: boolean;
    };

/**
 * The transcript's lines (`messenger.chat-transcript`): "Today", "Yesterday" or "Mon 23 Nov"
 * before each day's first entry, and an agent's message marked as a run's head when the line before
 * it isn't a message by the same author on the same day, or when it answers after that author's
 * automatic notes (`messenger.automatic-notes`). In a channel every message that isn't the
 * person's has a head (`messenger.author-from-source`). The person's own messages have none: their
 * bubble says whose they are. A message that goes on a run without a head of its own `follows`, so
 * a run reads as one group. Pending messages come last, after today's label if none shows.
 *
 * @example
 * chatLines(timeline, [], now).map((line) => line.kind); // ["day", "message", "message", "card"]
 */
export function chatLines(
  timeline: readonly TimelineEntry[],
  pending: readonly PendingMessage[],
  now: Date,
  channel = false,
): readonly ChatLine[] {
  const lines: ChatLine[] = [];
  let day = "";
  let author = "";
  // An agent's answer after its automatic notes gets its own head, so it doesn't carry their time.
  let afterNote = false;
  const startDay = (at: Date) => {
    const label = dayLabel(at, now);
    if (label === day) return;
    day = label;
    author = "";
    lines.push({ kind: "day", key: `day:${label}`, label });
  };
  for (const entry of timeline) {
    if (entry.kind === "card") {
      startDay(new Date(entry.card.createdAt));
      author = "";
      lines.push({ kind: "card", key: entry.card.id, card: entry.card });
      continue;
    }
    const { message } = entry;
    startDay(new Date(message.sentAt));
    const by = authorKey(message);
    const answer = afterNote && message.automatic !== true;
    const head = by !== "me" && (channel || by !== author || answer);
    lines.push({
      kind: "message",
      key: message.id,
      message,
      head,
      follows: !head && by === author,
    });
    author = by;
    afterNote = message.automatic === true;
  }
  if (pending.length > 0) startDay(now);
  for (const each of pending) {
    lines.push({
      kind: "pending",
      key: `pending:${each.key}`,
      pending: each,
      follows: author === "me",
    });
    author = "me";
  }
  return lines;
}

/**
 * "Today", "Yesterday", else the day itself, "Mon 23 Nov", by the local calendar; a day in another
 * year than `now` has its year too, "Mon 24 Nov 2025".
 */
export function dayLabel(at: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return messengerWords.today;
  if (days === 1) return messengerWords.yesterday;
  const day = at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  // Added by hand: with `year`, en-GB puts a comma after the weekday ("Mon, 24 Nov 2025").
  return at.getFullYear() === now.getFullYear() ? day : `${day} ${at.getFullYear()}`;
}

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

/** Who wrote a message, as one key: the person, an agent by its ID, or a person by name. */
function authorKey({ author }: Message): string {
  if (author.kind === "me") return "me";
  if (author.kind === "person") return `person:${author.name}`;
  return `agent:${author.agent}`;
}
