const minuteInMs = 60_000;
const hourInMs = 60 * minuteInMs;
const dayInMs = 24 * hourInMs;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
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

/**
 * True when an item has waited a day or more: the row shows its waiting
 * time in `warning` text, and the list isn't reordered (flow-inbox 4.1).
 */
export function isLate(since: Date, now: Date): boolean {
  return now.getTime() - since.getTime() >= dayInMs;
}

/**
 * The row's meta: "Waiting 1 min", "Waiting 6 h", "Waiting 2 days"
 * (flow-inbox 3.2). Under a minute still reads "1 min".
 */
export function waitingFor(since: Date, now: Date): string {
  return `Waiting ${elapsed(since, now, "short")}`;
}

/**
 * The card's header line (INBOX-CARD-15): "Waiting since 10:42 (1 min)",
 * "Waiting since 01:50 (6 h 40 min)", "Waiting since Sat 10:42 (2 days)".
 * The time is the approval's own, not the run's start.
 */
export function waitingSince(since: Date, now: Date): string {
  return `Waiting since ${clockTime(since, now)} (${elapsed(since, now, "long")})`;
}

/** The timer line of a wait step (mc 10.2): "Moves on by itself on Mon 9 Nov, 14:00." */
export function movesOnLine(at: Date): string {
  return `Moves on by itself on ${dayAndMonth(at)}, ${hoursAndMinutes(at)}.`;
}

/** The timer part of a wait step's row meta (flow-inbox 3.2): "moves on Mon 14:00". */
export function movesOnMeta(at: Date): string {
  return `moves on ${weekdays[at.getDay()]} ${hoursAndMinutes(at)}`;
}

/** A decision's time, as the decided card says it: "10:44". */
export function decidedAt(at: Date): string {
  return hoursAndMinutes(at);
}

function elapsed(since: Date, now: Date, form: "short" | "long"): string {
  const ms = Math.max(0, now.getTime() - since.getTime());
  if (ms >= dayInMs) {
    const days = Math.floor(ms / dayInMs);
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (ms >= hourInMs) {
    const hours = Math.floor(ms / hourInMs);
    const minutes = Math.floor((ms % hourInMs) / minuteInMs);
    return form === "long" && minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  return `${Math.max(1, Math.floor(ms / minuteInMs))} min`;
}

/** "10:42" today, "Sat 10:42" within the last week, else "Sat 31 Oct, 10:42". */
function clockTime(at: Date, now: Date): string {
  if (sameDay(at, now)) return hoursAndMinutes(at);
  if (now.getTime() - at.getTime() < 6 * dayInMs) {
    return `${weekdays[at.getDay()]} ${hoursAndMinutes(at)}`;
  }
  return `${dayAndMonth(at)}, ${hoursAndMinutes(at)}`;
}

function dayAndMonth(at: Date): string {
  return `${weekdays[at.getDay()]} ${at.getDate()} ${months[at.getMonth()]}`;
}

function hoursAndMinutes(at: Date): string {
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
