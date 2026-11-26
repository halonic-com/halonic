/**
 * The words of the phone's Inbox (Sofia's flow B; Noah's HAL-17514 `wording`, rows p02a and
 * p03a–p03f). The risky line is the built `ANSWER_RISKY_ON_COMPUTER`; what became of a sent answer
 * is `sendOutcomeLine`'s.
 */

/** "14:02": the phone's own clock for `iso`, hours and minutes. */
export function timeOf(iso: string): string {
  const at = new Date(iso);
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
}

export const inboxWords = {
  tab: "Inbox",
  needsYou: "Needs you",
  waiting: (count: number) => `${count} waiting`,
  /** The project chips (p02a); the row's name is for screen readers. */
  projects: "Project",
  allProjects: "All",
  noProject: "No project",
  asks: (name: string) => `${name} asks`,
  approval: (name: string) => `${name} · approval`,
  /** The card's back button: the phone's back label names where it goes. */
  back: "Inbox",
  reply: "Reply",
  next: "Next",
  youChose: (answer: string, iso: string) => `You chose: ${answer} · ${timeOf(iso)}`,
  /** By the person, so on the computer; else by whoever answered in Paperclip, the Inbox's only source. */
  answeredOn: (computer: string, iso: string) => `Answered on ${computer} at ${timeOf(iso)}`,
  answeredBy: (name: string, iso: string) => `Answered in Paperclip by ${name} at ${timeOf(iso)}`,
  emptyTitle: "Nothing is waiting for you",
  emptyText: "Questions and approvals from your agents show up here.",
  loading: "Loading the Inbox",
  noScreenLock: "Set a screen lock on this phone to answer from it. Reading still works.",
  openSettings: "Open settings",
  gone: "This card is gone from Paperclip.",
} as const;
