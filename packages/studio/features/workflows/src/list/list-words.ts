import type { WorkflowRunOutcome } from "../api.ts";

/** The Workflows list's words (microcopy 9.1, flow-workflows 2.1). */
export const listWords = {
  title: "Workflows",
  sentence: "A workflow is a set of steps your agents work through, one after the other.",
  newWorkflow: "New workflow",
  searchLabel: "Search workflows",
  loadingLabel: "Loading workflows",
  chipsLabel: "Hub",
  allChip: "All",
  loadFailedTitle: "Couldn't load workflows",
  tryAgain: "Try again",
  tryingAgain: "Trying again…",
  nothingYetTitle: "No workflows yet",
  emptyHub: (hubName: string) => `No workflows in ${hubName} yet.`,
  noMatch: (query: string) => `No workflows match "${query}".`,
  more: (name: string) => `More actions for ${name}`,
  needsYou: (count: number) => `${count} needs you`,
  running: (count: number) => `${count} running`,
  warnings: (count: number) => `${count === 1 ? "1 warning" : `${count} warnings`}`,
  problems: (count: number) => `${count === 1 ? "1 problem" : `${count} problems`}`,
  lastRun: (outcome: WorkflowRunOutcome, when: string) =>
    `Last run ${outcomeGlyph[outcome]}${when}`,
} as const;

/** The glyph before a finished run's time, so the outcome never rests on colour alone. */
const outcomeGlyph: Record<WorkflowRunOutcome, string> = {
  completed: "✓ ",
  failed: "✕ ",
  "cant-try": "✕ ",
  running: "",
  waiting: "",
};

const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const shortMonths = [
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

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * When a run started, for the row's Last run: "Today 09:05", "Yesterday 18:30", then the weekday and
 * date ("Fri 6 Nov 09:05"), with the year when it isn't this year's.
 */
export function runWhen(iso: string, now: Date): string {
  const moment = new Date(iso);
  const clock = `${String(moment.getHours()).padStart(2, "0")}:${String(moment.getMinutes()).padStart(2, "0")}`;
  if (sameDay(moment, now)) return `Today ${clock}`;
  if (sameDay(moment, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) {
    return `Yesterday ${clock}`;
  }
  const date = `${shortDays[moment.getDay()]} ${moment.getDate()} ${shortMonths[moment.getMonth()]}`;
  return `${moment.getFullYear() === now.getFullYear() ? date : `${date} ${moment.getFullYear()}`} ${clock}`;
}

/** The reason a failed read gives, as one sentence ending in a full stop. */
export function failureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.endsWith(".") ? message : `${message}.`;
}

/** The search and command words (microcopy 9.1). */
export const searchWords = {
  title: "Workflows",
  detail: (hubName: string) => `Workflow · ${hubName}`,
  newCommand: "New workflow",
} as const;
