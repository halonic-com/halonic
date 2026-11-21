import type { LiteCheckResult, StartView } from "./start-status.ts";

/** A line's state: ✓ works, ✕ problem, ! warning, – info. Never only a colour. */
export type CheckMark = "pass" | "problem" | "warning" | "info";

/** One line of Check this computer from the window (first-run-progress 3.2 and 4.2). */
export interface CheckLine {
  readonly label: string;
  readonly mark: CheckMark;
  /** What the screen and the report say. Never a path, a name or an error message. */
  readonly text: string;
  /** What only the report adds: the cause id, the phase and the exit code of a failed start. */
  readonly reportOnly?: string;
}

/** The glyph each mark has on screen and in the report. */
export const checkGlyphs: Readonly<Record<CheckMark, string>> = {
  pass: "✓",
  problem: "✕",
  warning: "!",
  info: "–",
};

/** The lines' words. Disk uses `halonic doctor`'s own; the rest are the window's (section 9). */
export const liteCheckWords = {
  title: "Check this computer",
  /** Once the start is ready the engine is running, so the intro no longer says it isn't (C525-1). */
  intro: (ready: boolean) =>
    ready
      ? "Checks what this window can on its own. It changes nothing, and the report stays on this computer until you copy it."
      : "Checks what this window can while the engine isn't running. It changes nothing, and the report stays on this computer until you copy it.",
  checking: "Checking this computer…",
  checkAgain: "Check again",
  copyReport: "Copy report",
  showReport: "Show the report",
  hideReport: "Hide the report",
  reportNote:
    "This is all the report holds. No keys, no file contents, no run data. Folder paths show as ~.",
  noProblems: "No problems found",
  allClear:
    "If something still doesn't work, copy the report and send it with your question. It has no keys, no file contents and no run data.",
  close: "Close",
  engine: "Engine",
  running: "Running",
  stillStarting: "Still starting",
  notRunning: "Not running",
  notRunningBecause: "Not running, because of the problem below",
  files: "Halonic's files",
  filesThere: "All there",
  filesMissing: "Some are missing or damaged. Reinstall Halonic, then open it again.",
  profile: "Profile folder",
  profileWritable: "Halonic can write to it",
  profileNotWritable:
    "Halonic can't write to it. Check that your account can change files in your home folder.",
  profileNotFound: "Couldn't check: Halonic couldn't find it",
  disk: "Disk",
  diskEnough: "Enough free space",
  lowOnDisk: (free: string) => `Low on disk space: ${free} free`,
  freeUnknown: "Free space unknown. Halonic couldn't read the free space on this drive.",
  sandbox: "Sandbox",
  sandboxSetUp: "Set up",
  sandboxNotSetUp: "Not set up yet. The demo doesn't need the sandbox.",
  couldNotCheck: "Couldn't check",
  notChecked: "Not checked",
  /** The line for the lite check's own checks when it hasn't run, or couldn't. */
  windowChecks: (failed: boolean) =>
    failed
      ? "Halonic's files, profile folder and disk, because the check couldn't run"
      : "Halonic's files, profile folder and disk, because Check this computer wasn't run",
  engineChecks: (ready: boolean) =>
    ready
      ? "The engine's checks, which this window can't run"
      : "The engine's checks, because the engine isn't running",
} as const;

/** Free bytes as the CLI writes a size: "0.6 GB". */
function gigabytes(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/** The line for one answer of the lite check, or none for the half of the sandbox line it merges. */
function resultLine(result: LiteCheckResult): CheckLine | undefined {
  const w = liteCheckWords;
  switch (result.id) {
    case "app_files":
      return result.fact === "present"
        ? { label: w.files, mark: "pass", text: w.filesThere }
        : { label: w.files, mark: "problem", text: w.filesMissing };
    case "profile_writable":
      if (result.fact === "writable")
        return { label: w.profile, mark: "pass", text: w.profileWritable };
      if (result.fact === "not_writable")
        return { label: w.profile, mark: "problem", text: w.profileNotWritable };
      return { label: w.profile, mark: "info", text: w.profileNotFound };
    case "disk_space":
      if (result.fact === "enough") return { label: w.disk, mark: "pass", text: w.diskEnough };
      if (result.fact === "low" && result.freeBytes !== undefined)
        return { label: w.disk, mark: "warning", text: w.lowOnDisk(gigabytes(result.freeBytes)) };
      return { label: w.disk, mark: "warning", text: w.freeUnknown };
    default:
      return undefined;
  }
}

/**
 * Windows only: one Sandbox line for the distro and its runtime. A sandbox that isn't set up is
 * info, never a problem: the demo doesn't use it (section 8, Sofia on HAL-13428).
 */
function sandboxLine(results: readonly LiteCheckResult[]): CheckLine | undefined {
  const distro = results.find((result) => result.id === "wsl_distro")?.fact;
  const runtime = results.find((result) => result.id === "wsl_runtime")?.fact;
  if (distro === undefined && runtime === undefined) {
    return undefined;
  }
  const w = liteCheckWords;
  if (distro === "unknown" || runtime === "unknown") {
    return { label: w.sandbox, mark: "info", text: w.couldNotCheck };
  }
  if (distro === "present" && runtime === "present") {
    return { label: w.sandbox, mark: "pass", text: w.sandboxSetUp };
  }
  return { label: w.sandbox, mark: "info", text: w.sandboxNotSetUp };
}

/** The Engine line: what the window knows of the start. */
function engineLine(start: StartView, problemBelow: boolean): CheckLine {
  const w = liteCheckWords;
  if (start.kind === "ready") return { label: w.engine, mark: "pass", text: w.running };
  if (start.kind === "waiting") return { label: w.engine, mark: "info", text: w.stillStarting };
  const reportOnly = [
    `cause ${start.cause}`,
    ...(start.exitCode === null ? [] : [`exit code ${start.exitCode}`]),
    `after ${start.seconds} s`,
  ].join(" · ");
  // One cause counts once: a ✕ below explains the engine, so this line points at it (4.2).
  return problemBelow
    ? { label: w.engine, mark: "info", text: w.notRunningBecause, reportOnly }
    : { label: w.engine, mark: "problem", text: w.notRunning, reportOnly };
}

/**
 * The dialog's lines, in order: Engine, the lite check's (Halonic's files, Profile folder, Disk,
 * and on Windows Sandbox), then the engine's own checks as Not checked, never as passed (4.4).
 * Without `results`, the lite check hasn't run, or `failed`, and its checks are Not checked too.
 *
 * @example
 * checkLines({ kind: "failed", cause: "timed_out", exitCode: null, seconds: 60 }, results)[0];
 * // { label: "Engine", mark: "problem", text: "Not running", reportOnly: "cause timed_out · after 60 s" }
 */
export function checkLines(
  start: StartView,
  results: readonly LiteCheckResult[] | undefined,
  failed = false,
): CheckLine[] {
  const notChecked = (text: string): CheckLine => ({
    label: liteCheckWords.notChecked,
    mark: "info",
    text,
  });
  const found = (results ?? []).flatMap((result) => resultLine(result) ?? []);
  // The sandbox's two answers make one line, after the others.
  const sandbox = results === undefined ? undefined : sandboxLine(results);
  if (sandbox !== undefined) {
    found.push(sandbox);
  }
  const problemBelow = found.some((line) => line.mark === "problem");
  return [
    engineLine(start, problemBelow),
    ...found,
    ...(results === undefined ? [notChecked(liteCheckWords.windowChecks(failed))] : []),
    notChecked(liteCheckWords.engineChecks(start.kind === "ready")),
  ];
}

/** How many lines have `mark`: "1 problem", "2 warnings", or nothing for none. */
function markCount(lines: readonly CheckLine[], mark: "problem" | "warning"): string[] {
  const count = lines.filter((line) => line.mark === mark).length;
  if (count === 0) return [];
  return [`${count} ${mark}${count === 1 ? "" : "s"}`];
}

/**
 * "1 problem", "1 problem · 1 warning", "1 warning", "No problems found": counts of causes, as the
 * marks on screen (4.2).
 */
export function checkHeading(lines: readonly CheckLine[]): string {
  const counts = [...markCount(lines, "problem"), ...markCount(lines, "warning")];
  return counts.length === 0 ? liteCheckWords.noProblems : counts.join(" · ");
}

/** Whether no line is a problem, so the dialog adds the all-clear sentence under them. */
export function allClear(lines: readonly CheckLine[]): boolean {
  return lines.every((line) => line.mark !== "problem");
}

/** The labels are padded to this width in the report, so the facts line up. */
const reportLabelWidth = 16;

/**
 * The plain text Copy report puts on the clipboard (first-run-progress 4.3). It is built from
 * named fields only: Halonic's version and system, the time, the heading and each line, with the
 * cause id and the exit code of a failed start. No path, name or error output can get in.
 *
 * @example
 * checkReport("Halonic 0.1.0 · Windows", new Date(), lines);
 * // "Check this computer\nHalonic 0.1.0 · Windows\n2026-11-21 10:42\n1 problem\n\n✕ Engine …"
 */
export function checkReport(about: string, at: Date, lines: readonly CheckLine[]): string {
  const rows = lines.map((line) => {
    const fact = line.reportOnly === undefined ? line.text : `${line.text} · ${line.reportOnly}`;
    return `${checkGlyphs[line.mark]} ${line.label.padEnd(reportLabelWidth)}${fact}`;
  });
  return [liteCheckWords.title, about, reportTime(at), checkHeading(lines), "", ...rows].join("\n");
}

/** The time as "2026-11-21 10:42", the same in every language. */
function reportTime(at: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
}
