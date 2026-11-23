/**
 * The words of the phone's run detail, as the board approved them with Noah's drawing on
 * HAL-16169 (wording from HAL-15240). The empty history's line is Sofia's copy check on HAL-16923:
 * it says the gap is on the phone, not that the agent did nothing.
 */

export const runWords = {
  /** The top bar's Back button. */
  back: "Back to Agents",
  /** The history's name: one named region, not a live region. */
  history: (agent: string) => `${agent}'s messages and approvals`,
  /** A reply's heading, for screen readers only. */
  said: (agent: string) => `${agent} said`,
  /** First in the history, once the phone dropped older events to stay within its cap. */
  droppedOlder: "Older activity isn't kept on this phone.",
  /** The phone holds no event of the agent and nothing waits. */
  nothingYet: (agent: string) => `No activity from ${agent} on this phone yet.`,
  /** A waiting approval's title; violet means "your turn". */
  waiting: (agent: string) => `${agent} is waiting for your OK`,
  /** An answered approval, in one quiet line: "Approved 13:53 · send_replies: {…}". */
  approved: (time: string) => `Approved ${time}`,
  denied: (time: string) => `Denied ${time}`,
  /** The end of the history while the agent runs and the view is live, with the spinner. */
  working: (agent: string) => `${agent} is working…`,
  /** The same while the view is stale: no spinner, since the phone can't know it still runs. */
  workingAsOf: (asOf: string) => `Working as of ${asOf}.`,
  /** After "Failed 14:10": the phone can't restart a run, so no Try again. */
  failedSeeComputer: "See what happened on your computer.",
} as const;
