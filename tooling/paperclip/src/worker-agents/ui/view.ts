import type { RunView, WorkerAgentsPage, WorkerRow } from "../page.ts";

/**
 * The Worker agents page's words, worked out apart from React so tests can
 * check them. Wording follows Sofia's states document (HAL-16208, section 4):
 * times in UTC, no colour words, cause codes as codes and never a sentence
 * from a log.
 */

/** A time as "14:02 UTC". */
export function utcTime(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

const runStatusWords: Readonly<Record<string, string>> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  timed_out: "Timed out",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

/** "Last run 14:02 UTC, Failed", or "No runs yet". An unknown status shows as its code. */
export function runText(run: RunView | undefined): string {
  if (run === undefined) {
    return "No runs yet";
  }
  return `Last run ${utcTime(run.at)}, ${runStatusWords[run.status] ?? run.status}`;
}

/** The hidden words after a current task's key: "and 1 more in progress", or nothing. */
export function moreText(row: WorkerRow): string | undefined {
  const more = row.current?.more ?? 0;
  return more > 0 ? `and ${more} more in progress` : undefined;
}

/** "18 agents · Pip left out". */
export function summaryText(page: WorkerAgentsPage): string {
  const leftOut = page.leftOut.length === 0 ? "" : ` · ${listText(page.leftOut)} left out`;
  return `${page.agents.length} agents${leftOut}`;
}

/** The cause of a failed read: the bridge's error code in lower case, never its message or details. */
export function loadErrorCause(error: { readonly code?: unknown }): string {
  return typeof error.code === "string" && /^[A-Z_]+$/.test(error.code)
    ? error.code.toLowerCase()
    : "unknown";
}

/** A task's page in Paperclip, or undefined when the company's prefix isn't known. */
export function taskHref(companyPrefix: string | null, identifier: string): string | undefined {
  return companyPrefix === null ? undefined : `/${companyPrefix}/issues/${identifier}`;
}

function listText(names: readonly string[]): string {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
