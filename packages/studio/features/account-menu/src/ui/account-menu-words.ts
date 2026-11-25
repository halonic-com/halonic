/**
 * The account menu's words (S2-25), as Noah decided them on HAL-18213: B7's Account and Sign out,
 * section 0's usage line, B4's signed-out page and the screen map's "No plan".
 */
export const accountMenuWords = {
  /** The trigger's accessible name: the initials alone don't say what it opens. */
  trigger: (name: string) => `Account menu, ${name}`,
  /** The menu's description, its quiet first row. Not a heading: the kit's are uppercase. */
  signedInAs: (name: string) => `Signed in as ${name}`,
  noPlan: "No plan",
  usage: (percent: number) => `${percent}% of this month's usage`,
  /** Read after the plan item from 80%, with the menu's `warning` dot. */
  nearlyUsed: "nearly used up",
  /** The same dot at 100%: a status, not an alarm, so no red. */
  usedUp: "used up",
  account: "Account",
  signOut: "Sign out",
  signOutFailed: "Couldn't sign out. Try again.",
  signedOut: (product: string) => `You've signed out of ${product}`,
  signedOutTitle: (product: string) => `Signed out · ${product}`,
  signInAgain: "Sign in again",
} as const;

/** From this percent the plan item carries the `warning` dot. */
export const nearlyUsedPercent = 80;

/** What the plan item shows: its label, the usage under it, and its attention words. */
export interface PlanItemWords {
  readonly label: string;
  readonly detail: string | undefined;
  readonly attention: string | undefined;
  /** The item's whole name for a screen reader: "Pro, 85% of this month's usage, nearly used up". */
  readonly name: string;
}

/**
 * The plan item's words: "Pro" over "62% of this month's usage", only "Pro" with no cost limit,
 * and "No plan" with no plan. The figure is capped at 100%, as AC-00's bar is.
 */
export function planItemWords(plan: string | null, usedPercent: number | null): PlanItemWords {
  if (plan === null || usedPercent === null) {
    const label = plan ?? accountMenuWords.noPlan;
    return { label, detail: undefined, attention: undefined, name: label };
  }
  const percent = Math.min(Math.max(usedPercent, 0), 100);
  const detail = accountMenuWords.usage(percent);
  const attention = attentionWords(percent);
  const parts = attention === undefined ? [plan, detail] : [plan, detail, attention];
  return { label: plan, detail, attention, name: parts.join(", ") };
}

function attentionWords(percent: number): string | undefined {
  if (percent >= 100) {
    return accountMenuWords.usedUp;
  }
  return percent >= nearlyUsedPercent ? accountMenuWords.nearlyUsed : undefined;
}
