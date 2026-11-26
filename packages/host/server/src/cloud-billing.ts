/** The billing states Cloud signs into a session token (S4-16): the banner the app shows. */
export const cloudBillingStates = ["payment_failed", "trial_ends", "no_plan"] as const;

/** One of {@link cloudBillingStates}. */
export type CloudBillingState = (typeof cloudBillingStates)[number];

/**
 * The customer's billing state as Cloud signed it, for the app's billing banners: the state, and
 * the day it is about (the card's update-by date, the trial's last day, or the day runs and files
 * are deleted without a plan).
 */
export interface CloudBilling {
  /** The `billing` claim. */
  readonly state: CloudBillingState;
  /** The `billing_until` claim: a real calendar day, written `YYYY-MM-DD`. */
  readonly until: string;
}

/** A calendar day as Cloud writes it, before the check that the day exists. */
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the optional `billing` and `billing_until` claims. Unlike the profile's other claims, a
 * wrong pair is ignored, never refused: a `billing` value this app doesn't know, a `billing_until`
 * that isn't a real `YYYY-MM-DD` day, or only one of the two claims gives `null`, and the session
 * stays valid. A newer Cloud may sign states an older app doesn't know, and a billing banner must
 * never lock a customer out of their app. Don't make it refuse to match the other claims.
 *
 * @param read reads one claim's own value, `undefined` when it is missing
 * @returns the billing state, or `null` when the token has none or a wrong one
 */
export function readCloudBilling(read: (name: string) => unknown): CloudBilling | null {
  const state = read("billing");
  const until = read("billing_until");
  if (!isBillingState(state) || !isCalendarDay(until)) {
    return null;
  }
  return Object.freeze({ state, until });
}

/** One of the billing states this app knows. */
function isBillingState(value: unknown): value is CloudBillingState {
  return cloudBillingStates.some((state) => state === value);
}

/** A `YYYY-MM-DD` string naming a day that exists, so `2026-02-30` is not one. */
function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !dayPattern.test(value)) {
    return false;
  }
  const day = new Date(`${value}T00:00:00Z`);
  // A day past the month's end either fails to parse or rolls over into the next month.
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}
