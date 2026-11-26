/**
 * What a customer reads for each unit, from the flows' Units table (HAL-12484, section 0). The
 * cost unit reads as "usage", a percentage only and never money: model cost is the seller's cost,
 * not the customer's price. A unit missing here gets no banner rather than a made-up name.
 */
const unitNames: ReadonlyMap<string, string> = new Map([
  ["runs", "runs"],
  ["steps", "steps"],
  ["tokens", "tokens"],
  ["harnessMs", "agent time"],
  ["cost", "usage"],
]);

/** The 80% banner's words, flow C3's 80% row (`limit.warning`). */
export const usageBannerWords = {
  /** "You've used 80% of this month's agent time": the mark reached, whatever the exact figure. */
  title: (unitName: string) => `You've used 80% of this month's ${unitName}`,
  resets: (date: string) => `It resets on ${date}.`,
  seeUsage: "See usage",
  close: "Close",
} as const;

/** The name a customer reads for a usage account unit, or `undefined` for one the flows don't name. */
export function unitName(unit: string): string | undefined {
  return unitNames.get(unit);
}

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
