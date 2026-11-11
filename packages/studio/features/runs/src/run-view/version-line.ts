import type { RunVersion } from "@halonicjs/events";

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

/** How long a commit reads in the line's tooltip: "Commit 3f2a1c9". */
const shortCommitLength = 7;

/** What the run view says a run ran: the line's text, and the tooltip when it has one. */
export interface VersionLine {
  readonly text: string;
  /** Only for a run on the live version: "Commit 3f2a1c9". */
  readonly tooltip?: string;
}

/**
 * The line under a run's title that says what it ran (`runs.run-view.live-or-saved`), from the
 * `version` its `run.started` records. The time is when the version was made, never when a file
 * changed, so the line never says "changed since". A run from before the log recorded it has no
 * `version`: that reads "Version not recorded.", not as the saved files.
 *
 * @example
 * versionLine({ reads: "live-version", commit: "3f2a1c9e…", versionDate: "2026-11-10T10:42:00Z" }, now);
 * // { text: "Ran the live version from 10 Nov, 10:42.", tooltip: "Commit 3f2a1c9" }
 * versionLine({ reads: "saved-files" }, now); // { text: "Ran the saved files." }
 * versionLine(undefined, now); // { text: "Version not recorded." }
 */
export function versionLine(version: RunVersion | undefined, now: Date): VersionLine {
  if (version === undefined) {
    return { text: "Version not recorded." };
  }
  if (version.reads === "saved-files") {
    return { text: "Ran the saved files." };
  }
  return {
    text: `Ran the live version from ${versionTime(new Date(version.versionDate), now)}.`,
    tooltip: `Commit ${version.commit.slice(0, shortCommitLength)}`,
  };
}

/** "10:42" for a version made today, else "10 Nov, 10:42". */
function versionTime(madeAt: Date, now: Date): string {
  const time = `${twoDigits(madeAt.getHours())}:${twoDigits(madeAt.getMinutes())}`;
  return sameDay(madeAt, now) ? time : `${madeAt.getDate()} ${months[madeAt.getMonth()]}, ${time}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
