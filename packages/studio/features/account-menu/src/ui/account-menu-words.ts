/**
 * The account menu's words (S2-25). Proposals until Noah and Sofia decide them on HAL-18213; the
 * signed-out line is B4's.
 */
export const accountMenuWords = {
  /** The trigger's accessible name: the initials alone don't say what it opens. */
  trigger: (name: string) => `Account menu, ${name}`,
  noPlan: "No plan",
  /** Read after the usage line from 80%, with the menu's `warning` dot. */
  nearlyUsed: "nearly used up",
  account: "Account",
  signOut: "Sign out",
  signOutFailed: "Couldn't sign out. Try again.",
  signedOut: (product: string) => `You've signed out of ${product}`,
  signInAgain: "Sign in again",
} as const;

/** From this percent the usage line carries the `warning` dot. */
export const nearlyUsedPercent = 80;

/**
 * The plan and usage line: "Pro · 62% of this month's usage", only the plan's name with no cost
 * limit, and "No plan" with no plan.
 */
export function usageLine(plan: string | null, usedPercent: number | null): string {
  if (plan === null) {
    return accountMenuWords.noPlan;
  }
  if (usedPercent === null) {
    return plan;
  }
  return `${plan} · ${usedPercent}% of this month's usage`;
}
