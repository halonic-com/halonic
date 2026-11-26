/**
 * A channel's words: its box, the To line, the `@` picker and the work lines under the person's
 * messages. Each is a row of HAL-17514's `wording` table (flows G, I, J and K), approved with the
 * phase 2 card on HAL-17544; Nina checked the new rows on HAL-17547.
 */
export const channelWords = {
  /** The box's name and placeholder: "Message Engineering", as phase 1's "Message Writer". */
  composer: (channel: string) => `Message ${channel}`,
  empty: "No messages yet",
  emptyHint: (lead: string) =>
    `Ask the channel anything: ${lead} (lead) answers unless you name someone with @.`,
  toLead: (lead: string) => `To ${lead} (lead) · Type @ to ask someone else`,
  to: (names: readonly string[]) => `To ${andList(names)}`,
  /** Above a sent message that named nobody, as the To line's first part (k10d, k11a). */
  toLeadSent: (lead: string) => `To ${lead} (lead)`,
  toNobody: "To nobody yet",
  noLead: "Name someone with @, or pick a lead in Members.",
  picker: "Members · ↑↓ to pick · Enter names them · Esc closes",
  /** A channel's row in the list (k14a): its size, and who is working (Noah, HAL-18224: "1 working · Elena" too). */
  row: {
    size: (count: number) => `${count} agents`,
    working: (names: readonly string[]) => `${names.length} working · ${names.join(", ")}`,
  },
  /** What waits for the person in a channel (flow K, k13a). */
  waiting: {
    bar: (count: number) => `${count} waiting for you`,
    next: "Next",
    alsoInInbox: (channel: string) =>
      `Also in your Inbox, asked in ${channel}. Answering here answers it there.`,
  },
  /** An agent's message whose agent the source no longer lists ("An agent left the source"). */
  authorGone: (source: string) => `No longer in ${source}`,
  /** The same, when the source itself is gone too, so it has no label to name. */
  authorGoneNoSource: "No longer listed",
  /** A chip's remove button, as a file's in the box. */
  unname: (name: string) => `Remove ${name}`,
  work: {
    starting: (agent: string) => `${agent} · starting…`,
    working: (agent: string, minutes: number) => `${agent} · working · ${minutes} min`,
    answered: (agent: string) => `${agent} answered`,
    /** Without the question's text, while its card hasn't been read yet, the line ends at "asks you". */
    asksYou: (agent: string, question: string | undefined) =>
      question === undefined ? `${agent} asks you` : `${agent} asks you: ${question}`,
    /** A failed line whose source gave no reason. */
    closed: (agent: string) => `${agent}'s task was closed without an answer.`,
    /** A failed line with the source's reason, as plain text (HAL-18156). */
    couldntFinish: (agent: string, reason: string) => `${agent} couldn't finish: ${reason}`,
    passedOn: (agent: string, to: string) => `${agent} passed this to ${to}`,
    handOffLimit: "Stopped after 3 hand-offs. Name who should answer.",
  },
} as const;

/** "Elena", "Elena and Liam", "Elena, Liam and Owen". */
function andList(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
