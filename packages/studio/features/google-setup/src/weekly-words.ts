import { type SetupRecord, type WeeklySignIn, weeklySignIn } from "@halonicjs/google-setup";

/** "15 Nov": the day and the short month, as the design writes dates. */
function day(at: Date): string {
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "10:42": the time on a 24-hour clock. */
function time(at: Date): string {
  return at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The weekly sign-in step 7 tells about: a personal *Testing* app's current sign-in, while Google
 * hasn't refused it and it hasn't ended yet. `null` otherwise, so no date in the past is shown.
 */
export function shownWeeklySignIn(record: SetupRecord, now: Date): WeeklySignIn | null {
  const weekly = weeklySignIn(record);
  if (weekly === null || record.refreshRefused !== null || now >= weekly.endsAt) return null;
  return weekly;
}

/**
 * The words for a personal *Testing* app's weekly sign-in (design 3.5 and 5.2). Always a date,
 * never a countdown, which would read as a deadline the user missed.
 */
export const weeklyWords = {
  /** Step 7 after a sign-in: "Google ends this sign-in on 15 Nov at 10:42." */
  endsOn: (weekly: WeeklySignIn) =>
    `Google ends this sign-in on ${day(weekly.endsAt)} at ${time(weekly.endsAt)}.`,
  /** Added to step 7's finished line: "Studio reminds you on 14 Nov to sign in again." */
  remindsOn: (weekly: WeeklySignIn) =>
    `Studio reminds you on ${day(weekly.remindFrom)} to sign in again.`,
  /** The reminder's progress line in the Inbox: "Google ends the sign-in on 15 Nov, 10:42". */
  inboxLine: (weekly: WeeklySignIn) =>
    `Google ends the sign-in on ${day(weekly.endsAt)}, ${time(weekly.endsAt)}`,
  /** The reminder's banner in the item, naming the services that keep running. */
  endsSoon: (weekly: WeeklySignIn, services: string) =>
    `Google ends this sign-in on ${day(weekly.endsAt)} at ${time(weekly.endsAt)}, because your app is in Testing. Sign in again now, and workflows that use ${services} keep running.`,
  /** The refused sign-in at the weekly end (design 5.2 row 3). */
  ended:
    "Your weekly sign-in ended. Google ends the sign-in after 7 days for apps in Testing. Sign in again; your setup is kept. Nothing ran.",
} as const;
