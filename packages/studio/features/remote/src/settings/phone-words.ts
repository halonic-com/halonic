import type { PairedPhone, PhonePlatform } from "@halonicjs/ports";
import { CONNECTED_NOW, NOT_SEEN_YET, REMOTE_IS_OFF } from "./remote-text.ts";

const platformNames: Record<PhonePlatform, string> = { android: "Android", ios: "iOS" };

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "14 Nov", with the year when it isn't this year's: "3 Nov 2025". */
export function dayOf(moment: Date, now: Date): string {
  const day = `${moment.getDate()} ${months[moment.getMonth()]}`;
  return moment.getFullYear() === now.getFullYear() ? day : `${day} ${moment.getFullYear()}`;
}

/** "Android · Paired 14 Nov": the platform until the host reports the OS version (decision 25). */
export function pairedLine(phone: PairedPhone, now: Date): string {
  return `${platformNames[phone.platform]} · Paired ${dayOf(new Date(phone.pairedAt), now)}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const count = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

/** "just now", "5 minutes ago", "1 hour ago", "2 days ago", then the day from a week on. */
export function agoOf(moment: Date, now: Date): string {
  const ms = now.getTime() - moment.getTime();
  if (ms < MINUTE) return "just now";
  if (ms < HOUR) return count(Math.floor(ms / MINUTE), "minute");
  if (ms < DAY) return count(Math.floor(ms / HOUR), "hour");
  if (ms < 7 * DAY) return count(Math.floor(ms / DAY), "day");
  return dayOf(moment, now);
}

/** "Connected now", "Last seen 2 days ago", or "Remote is off" for every phone while it is. */
export function seenLine(phone: PairedPhone, on: boolean, now: Date): string {
  if (!on) return REMOTE_IS_OFF;
  if (phone.connected) return CONNECTED_NOW;
  if (phone.lastSeenAt === undefined) return NOT_SEEN_YET;
  return `Last seen ${agoOf(new Date(phone.lastSeenAt), now)}`;
}
