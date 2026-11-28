/**
 * The words of the phone's Messenger tab (Noah's HAL-17514 `wording`: flow C, rows p02b and p04a;
 * flow H, k16c; flow I, k10d and k16b; p06e). Nothing is ever sent twice, so no line offers to send by
 * itself.
 */

import type { AgentActivity } from "@halonicjs/ports";
import type { MessagingOutcome } from "./messaging-client.ts";

export const phoneMessengerWords = {
  /** The tab's name (p02a), and the chips' row name for a screen reader. */
  title: "Messenger",
  /** p02b, the list's chips: "Waiting for me · 2" while something waits. */
  all: "All",
  waitingChip: (count: number) => (count > 0 ? `Waiting for me · ${count}` : "Waiting for me"),
  /** Until the first conversations read answers, as the Inbox's (Noah's HAL-20039 design note). */
  loading: "Loading Messenger",
  /** The computer has no chats (HAL-20039). */
  emptyTitle: "No chats yet",
  emptyText: (computer: string) => `Chats you start on ${computer} show up here.`,
  /** Waiting for me picked, and nothing waits (HAL-20039). */
  nothingWaiting: "Nothing is waiting for you.",
  /** A chat's back button, named for where it goes, as the Inbox card's "Inbox" (HAL-20039). */
  back: "Messenger",
  /** After a link's address, for a screen reader only: the tap leaves for the browser (L4). */
  opensInBrowser: " opens in your browser",
  /** p04a: "Message Chief…", as the prompt box writes it. */
  placeholder: (title: string) => `Message ${title}…`,
  /** The box's name for a screen reader. */
  label: "Message",
  send: "Send",
  /** k16b: the `@` button's name and the sheet's title. */
  nameSomeone: "Name someone",
  /** k10d: "To Elena", "To Elena and Liam". */
  to: (names: readonly string[]) => `To ${listOf(names)}`,
  members: "Members",
  lead: "Lead",
  /** k16c: members change only on the computer. */
  membersOnComputer: (computer: string) => `Change members on ${computer}.`,
  /** Flow C, "Too long": `gatewayMaxPromptLength`, written out. */
  tooLong: "A message from the phone can be at most 10,000 characters.",
  /** Flow C, "Dropped mid-send". */
  cutOff:
    "The connection dropped before your computer confirmed this message. Once your phone reconnects, you'll see whether it arrived. Send it again only if it didn't.",
  /** p04c: the computer isn't answering. The text stays in the box. */
  offline: (computer: string) =>
    `You can send once ${computer} answers again. Your text stays here.`,
  /** As the prompt box's refusal line, for a message. */
  refused: "Your computer didn't accept this message. Send it from your computer instead.",
  /** Flow C, "One source not answering": "Paperclip · Halonic is offline, as of 14:02, …". */
  sourceOffline: (source: string, asOf: string) =>
    `${source} is offline, as of ${asOf}, so its chats may be out of date.`,
  /** p06e: a read the drop cut off, or one that never left the phone. */
  notAnswering: (computer: string) => `Couldn't load it: ${computer} isn't answering.`,
  /** A read the computer refused for any other reason (Noah's check, HAL-19232). */
  notLoaded: (computer: string) =>
    `Couldn't load it: ${computer} turned it down. You can open it there.`,
  tryAgain: "Try again",
  /** p02b, a row's second line while the chat's agent works on it. */
  working: "Working…",
  /** p02b's row, its second line: what was left in its box and not sent. */
  draft: (text: string) => `Draft: ${text}`,
  /** The violet dot after a row's name while the chat waits for the person, read as this. */
  needsYouDot: ", needs you",
  /** The list's name for a screen reader, as the desktop's. */
  chatsLabel: "Chats",
  /** While a message is on its way, as the desktop's pending message says. */
  sending: "Sending…",
  /** A chat while its messages load: the desktop Messenger's words (HAL-18481, improvement 3). */
  loadingChat: "Loading this chat",
  stillLoading: "Still loading",
  today: "Today",
  yesterday: "Yesterday",
  /** p04a, the header's status line after the source: the desktop's activity words. */
  activity: {
    idle: "Idle",
    working: "Working",
    waiting: "Waiting",
    paused: "Paused",
    other: "",
  } satisfies Record<AgentActivity, string>,
  /** k14a: a channel's size after its name. */
  channelSize: (count: number) => `${count} agents`,
  /** Group 15: the lead in a channel's member line, "Chief (lead) · Liam · Elena". */
  leadName: (name: string) => `${name} (lead)`,
  /** k10d: the box's To line while nobody is named. */
  toLead: (lead: string) => `To ${lead} (lead) · Type @ to ask someone else`,
} as const;

/** What a read the host didn't answer came back as. */
export type ReadFailure = Exclude<MessagingOutcome<unknown>, { readonly kind: "done" }>;

/** An offline source's label and when it last answered, already worded ("14:02"). */
export interface OfflineSource {
  readonly label: string;
  readonly asOf: string;
}

/**
 * The lines in place of a list or a chat that couldn't be read: one per offline source when the
 * host said `offline` and named them, else one line about the computer.
 */
export function readLines(
  failure: ReadFailure,
  offline: readonly OfflineSource[],
  computer: string,
): readonly string[] {
  if (failure.kind === "refused" && failure.code === "offline" && offline.length > 0) {
    return offline.map((source) => phoneMessengerWords.sourceOffline(source.label, source.asOf));
  }
  return failure.kind === "refused"
    ? [phoneMessengerWords.notLoaded(computer)]
    : [phoneMessengerWords.notAnswering(computer)];
}

/** The line under the box after a send; `undefined` once the host took it. */
export function sendLine(outcome: MessagingOutcome<unknown>, computer: string): string | undefined {
  switch (outcome.kind) {
    case "done":
      return undefined;
    case "cut-off":
      return phoneMessengerWords.cutOff;
    case "refused":
      return phoneMessengerWords.refused;
    case "not-sent":
      if (outcome.reason === "invalid") return phoneMessengerWords.tooLong;
      return outcome.reason === "off" || outcome.reason === "not-open"
        ? phoneMessengerWords.offline(computer)
        : phoneMessengerWords.refused;
  }
}

/**
 * "Today", "Yesterday", else the day itself, "Mon 23 Nov", by the local calendar; a day in another
 * year than `now` has its year too, "Mon 24 Nov 2025". The desktop Messenger's `dayLabel`.
 */
export function dayLabel(at: Date, now: Date): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) return phoneMessengerWords.today;
  if (days === 1) return phoneMessengerWords.yesterday;
  const day = at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  // Added by hand: with `year`, en-GB puts a comma after the weekday ("Mon, 24 Nov 2025").
  return at.getFullYear() === now.getFullYear() ? day : `${day} ${at.getFullYear()}`;
}

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

/** "Elena", "Elena and Liam", "Elena, Liam and Chief". */
function listOf(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
