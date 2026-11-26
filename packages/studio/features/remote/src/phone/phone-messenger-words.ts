/**
 * The words of the phone's Messenger tab (Noah's HAL-17514 `wording`: flow C, rows p02b and p04a;
 * flow H, k16c; flow I, k10d and k16b; p06e). Nothing is ever sent twice, so no line offers to send by
 * itself.
 */

import type { MessagingOutcome } from "./messaging-client.ts";

export const phoneMessengerWords = {
  /** The tab's name (p02a), and the chips' row name for a screen reader. */
  title: "Messenger",
  /** p02b, the list's chips: "Waiting for me · 2" while something waits. */
  all: "All",
  waitingChip: (count: number) => (count > 0 ? `Waiting for me · ${count}` : "Waiting for me"),
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

/** "Elena", "Elena and Liam", "Elena, Liam and Chief". */
function listOf(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
