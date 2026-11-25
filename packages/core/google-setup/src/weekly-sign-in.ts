import { personalAppOf, type SetupValues } from "./setup-record.ts";

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

/** Google ends a sign-in to a personal app in *Testing* 7 days after it was given. */
export const weeklySignInMs = 7 * dayMs;

/**
 * Studio reminds the user a day before the sign-in ends, so a routine that
 * runs every morning doesn't fail on day 8 before anyone sees it (design 5.2).
 */
export const reminderBeforeEndMs = dayMs;

/**
 * Google ends the sign-in after about 7 days. The window is 6½ to 7½ days
 * after the last sign-in, both ends included, so a refresh a little early or
 * late still counts as the weekly end.
 */
export const weeklyEndWindowMs = { from: 156 * hourMs, to: 180 * hourMs } as const;

/** The parts of a setup record the weekly sign-in reads. */
export type WeeklySignInRecord = Pick<
  SetupValues,
  "accountType" | "inProductionTickedAt" | "personalApp" | "lastSignInAt"
>;

/** When a personal app's sign-in in *Testing* ends, and when Studio reminds the user. */
export interface WeeklySignIn {
  /** 7 days after the last sign-in. Studio shows it as a date, never as a countdown. */
  readonly endsAt: Date;
  /** A day before `endsAt`. */
  readonly remindFrom: Date;
}

/** Whether Google ends this account's sign-in every 7 days: a personal app in *Testing*. */
export function isInTesting(record: Omit<WeeklySignInRecord, "lastSignInAt">): boolean {
  return personalAppOf(record)?.publishing === "testing";
}

/**
 * When the last sign-in ends and when Studio reminds the user, from the
 * setup record alone: no call to Google (design 3.5 and 5.2). `null` for a
 * Workspace account, a personal app *In production*, or before the first
 * sign-in.
 *
 * @example
 * weeklySignIn(record)?.endsAt; // 15 Nov 10:42 for a sign-in on 8 Nov 10:42
 */
export function weeklySignIn(record: WeeklySignInRecord): WeeklySignIn | null {
  if (!isInTesting(record) || record.lastSignInAt === null) {
    return null;
  }
  const signedInAt = Date.parse(record.lastSignInAt);
  return {
    endsAt: new Date(signedInAt + weeklySignInMs),
    remindFrom: new Date(signedInAt + weeklySignInMs - reminderBeforeEndMs),
  };
}

/**
 * Whether the sign-in ends within a day, which gives the connector state
 * **Sign-in ends soon**. It holds from `remindFrom` until the sign-in ends,
 * and never while a refused refresh is saved: that state says more.
 *
 * @param now - the time to judge at, from the caller's clock
 */
export function signInEndsSoon(
  record: WeeklySignInRecord & Pick<SetupValues, "refreshRefused">,
  now: Date,
): boolean {
  const weekly = weeklySignIn(record);
  if (weekly === null || record.refreshRefused !== null) {
    return false;
  }
  return now >= weekly.remindFrom && now < weekly.endsAt;
}

/**
 * Whether the "Sign in again" reminder belongs in the Inbox: the sign-in
 * ends soon, and the user hasn't closed the reminder with **Not now** since
 * the last sign-in. A new sign-in brings it back the next week.
 *
 * @param now - the time to judge at, from the caller's clock
 */
export function isReminderDue(
  record: WeeklySignInRecord & Pick<SetupValues, "refreshRefused" | "reminderClosedAt">,
  now: Date,
): boolean {
  if (!signInEndsSoon(record, now)) {
    return false;
  }
  const closedAt = record.reminderClosedAt;
  // `signInEndsSoon` holds only after a sign-in, so `lastSignInAt` is set here.
  return closedAt === null || closedAt < (record.lastSignInAt ?? "");
}

/**
 * Whether a refused sign-in is the weekly end of a *Testing* app: refused
 * 6½ to 7½ days after the last sign-in, **and** the record says *Testing*.
 * With *In production* the timing is a coincidence as far as Studio knows,
 * so it isn't called the weekly end (design 5.2).
 *
 * @param refusedAt - when Google refused the refresh
 */
export function isWeeklyEnd(record: WeeklySignInRecord, refusedAt: Date): boolean {
  if (!isInTesting(record) || record.lastSignInAt === null) {
    return false;
  }
  const sinceSignIn = refusedAt.getTime() - Date.parse(record.lastSignInAt);
  return sinceSignIn >= weeklyEndWindowMs.from && sinceSignIn <= weeklyEndWindowMs.to;
}
