/** The 80% banner's words, flow C3's 80% row (`limit.warning`). */
export const usageBannerWords = {
  /** "You've used 95% of this month's agent time": the warning's own whole percent. */
  title: (percent: number, unitName: string) =>
    `You've used ${percent}% of this month's ${unitName}`,
  resets: (date: string) => `It resets on ${date}.`,
  seeUsage: "See usage",
  close: "Close",
} as const;

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2 Dec 2026": the reset day in UTC, the time zone the usage account's periods are kept in, so
 * every customer reads the same day the plan says. Same style as the connection row's "24 Dec 2026";
 * the months are spelled out here because a locale's short names differ ("Sept").
 */
export function resetDay(resetsAt: string): string {
  const at = new Date(resetsAt);
  return `${at.getUTCDate()} ${months[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}
