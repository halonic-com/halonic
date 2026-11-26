/** The 80% banner's words, flow C3's 80% row (`limit.warning`). */
export const usageBannerWords = {
  /** "You've used 80% of this month's agent time": the mark reached, whatever the exact figure. */
  title: (unitName: string) => `You've used 80% of this month's ${unitName}`,
  resets: (date: string) => `It resets on ${date}.`,
  seeUsage: "See usage",
  close: "Close",
} as const;

/**
 * "2 December": the reset day in UTC, the time zone the usage account's periods are kept in, so
 * every customer reads the same day the plan says.
 */
export function resetDay(resetsAt: string): string {
  return new Date(resetsAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
