import * as text from "./sandbox-text.ts";

/** How long a setup may run before Studio says so (SB3). The command isn't stopped. */
export const SETUP_TIME_LIMIT_MS = 3 * 60 * 1000;

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today at 09:12", "yesterday at 09:12" or "3 Nov at 09:12", as the section says when it checked. */
export function checkedAtLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAgo = Math.round((day(now).getTime() - day(at).getTime()) / 86_400_000);
  if (daysAgo === 0) return `today at ${time}`;
  if (daysAgo === 1) return `yesterday at ${time}`;
  return `${at.getDate()} ${months[at.getMonth()]} at ${time}`;
}

/** What the host's check says, in the words the section needs. */
export type SandboxCheckFacts =
  | { readonly state: "ready"; readonly checkedAt: string }
  | { readonly state: "needs-setup" }
  | { readonly state: "needs-repair"; readonly reason: string }
  /** The check ran and says the sandbox can't run now, for a reason a person or an administrator fixes. */
  | { readonly state: "unavailable"; readonly reason: string }
  /** The check itself didn't happen or couldn't be read. */
  | { readonly state: "unknown"; readonly reason: string };

/** How the last setup, repair or removal ended, when it failed. */
export type SandboxOutcome =
  | { readonly kind: "setup"; readonly how: "cancelled" }
  | { readonly kind: "setup"; readonly how: "timed-out"; readonly repairing: boolean }
  | { readonly kind: "setup"; readonly how: "failed" | "check_failed"; readonly reason: string }
  | { readonly kind: "remove"; readonly how: "cancelled" }
  | { readonly kind: "remove"; readonly how: "failed"; readonly reason: string }
  | { readonly kind: "remove"; readonly how: "in-use"; readonly runs: number };

/** What runs now: the elevated step, then the check that follows it. */
export interface SandboxRunning {
  readonly verb: "setup" | "repair" | "remove";
  readonly step: "elevating" | "checking";
}

export interface SandboxFacts {
  /** False on Windows builds without the sandbox (D44 c). */
  readonly available: boolean;
  /** Served Studio and the phone only look (IU 13.6). */
  readonly place: "app" | "served";
  readonly check: SandboxCheckFacts;
  readonly running: SandboxRunning | null;
  readonly outcome: SandboxOutcome | null;
}

export type ChipTone = "warning" | "neutral" | "success";
export type SandboxAction = "remove" | "check-again";

export interface SandboxStep {
  readonly mark: "done" | "doing" | "waiting";
  readonly label: string;
  readonly note?: string;
}

export interface SandboxView {
  readonly chip: { readonly label: string; readonly tone: ChipTone } | null;
  readonly lead: string;
  /** The failure Callout, with **Try again** when the same command can run again. */
  readonly callout: { readonly line: string; readonly action: "try-again" | null } | null;
  readonly steps: readonly SandboxStep[];
  /** Under the buttons. */
  readonly hint: string | null;
  /** The primary button, if one shows, and whether it is busy. */
  readonly primary: {
    readonly action: "set-up" | "repair";
    readonly label: string;
    readonly busy: boolean;
  } | null;
  readonly secondary: readonly SandboxAction[];
}

const none = {
  chip: null,
  callout: null,
  steps: [],
  hint: null,
  primary: null,
  secondary: [],
} as const;

/**
 * Settings › Agent sandbox as a state (`settings.agent-sandbox-state`): which chip, words,
 * Callout, steps and buttons show. Nothing here starts a setup.
 *
 * @example
 * sandboxView({ available: true, place: "app", check: { state: "needs-setup" }, running: null, outcome: null }).primary
 * // { action: "set-up", label: "Set up the sandbox", busy: false }
 */
export function sandboxView(facts: SandboxFacts, now: Date = new Date()): SandboxView {
  if (!facts.available)
    return { ...none, lead: text.NOT_AVAILABLE, chip: { label: "Not available", tone: "neutral" } };
  const { check, running, outcome } = facts;
  const callout = outcome ? calloutFor(outcome) : null;

  if (running) return busyView(running, check);

  return checkedView(check, facts.place === "served", callout, now);
}

function checkedView(
  check: SandboxCheckFacts,
  viewOnly: boolean,
  callout: SandboxView["callout"],
  now: Date,
): SandboxView {
  const hint = (line: string) => (viewOnly ? text.VIEW_ONLY : line);
  switch (check.state) {
    case "ready":
      return {
        ...none,
        chip: { label: "Ready", tone: "success" },
        lead: `Checked ${checkedAtLabel(check.checkedAt, now)}`,
        callout,
        hint: viewOnly ? text.VIEW_ONLY : null,
        secondary: viewOnly ? ["check-again"] : ["check-again", "remove"],
      };
    case "needs-repair":
      return {
        ...none,
        chip: { label: "Needs repair", tone: "warning" },
        lead: text.needsRepair(check.reason),
        callout,
        hint: hint(text.REPAIR_HINT),
        primary: viewOnly ? null : { action: "repair", label: text.REPAIR, busy: false },
        secondary: viewOnly ? ["check-again"] : ["remove"],
      };
    case "unavailable":
      return {
        ...none,
        chip: null,
        lead: text.notReady(check.reason),
        callout,
        secondary: ["check-again"],
      };
    case "unknown":
      return {
        ...none,
        chip: null,
        lead: text.cannotCheck(check.reason),
        callout,
        secondary: ["check-again"],
      };
    case "needs-setup":
      return {
        ...none,
        chip: { label: "Needs setting up", tone: "warning" },
        lead: text.NEEDS_SETUP,
        callout,
        hint: hint(text.ADMIN_ONCE),
        primary: viewOnly ? null : { action: "set-up", label: text.SET_UP, busy: false },
        secondary: viewOnly ? ["check-again"] : [],
      };
  }
}

function busyView(running: SandboxRunning, check: SandboxCheckFacts): SandboxView {
  const repairing = running.verb === "repair";
  const removing = running.verb === "remove";
  const doing = {
    setup: text.STEP_SETTING_UP,
    repair: text.STEP_REPAIRING,
    remove: text.STEP_REMOVING,
  }[running.verb];
  const done = repairing ? text.STEP_REPAIRED : text.STEP_SET_UP;
  const steps: SandboxStep[] =
    running.step === "elevating"
      ? [
          { mark: "doing", label: doing, note: text.UAC_WAITING },
          ...(removing ? [] : [{ mark: "waiting", label: text.STEP_CHECKING } as const]),
        ]
      : [
          { mark: "done", label: done },
          { mark: "doing", label: `${text.STEP_CHECKING}…` },
        ];
  return {
    ...none,
    chip: removing ? chipOf(check) : { label: "Setting up", tone: "neutral" },
    lead: "",
    steps,
    primary: removing
      ? null
      : {
          action: repairing ? "repair" : "set-up",
          label: repairing ? text.BUSY_REPAIR : text.BUSY_SET_UP,
          busy: true,
        },
    secondary: [],
  };
}

function chipOf(check: SandboxCheckFacts): SandboxView["chip"] {
  return check.state === "ready" ? { label: "Ready", tone: "success" } : null;
}

function calloutFor(outcome: SandboxOutcome): SandboxView["callout"] {
  if (outcome.kind === "remove") {
    switch (outcome.how) {
      case "cancelled":
        return { line: text.REMOVE_DENIED, action: null };
      case "failed":
        return { line: text.removeFailed(outcome.reason), action: null };
      case "in-use":
        return { line: text.removeInUse(outcome.runs), action: null };
    }
  }
  switch (outcome.how) {
    case "cancelled":
      return { line: text.DENIED, action: "try-again" };
    case "timed-out":
      return {
        line: outcome.repairing ? text.REPAIR_TOOK_TOO_LONG : text.TOOK_TOO_LONG,
        action: "try-again",
      };
    case "failed":
      return { line: text.failedSetUp(outcome.reason), action: "try-again" };
    case "check_failed":
      return { line: text.failedCheck(outcome.reason), action: "try-again" };
  }
}

/** Whether a setup that began at `startedAt` has run past the time limit. */
export function setupTimedOut(startedAt: number, now: number): boolean {
  return now - startedAt >= SETUP_TIME_LIMIT_MS;
}

/**
 * The state a result leaves behind for the section. A `check_failed` setup is Needs repair, the
 * other failures leave Needs setting up (checklist 1.4); a later passing check clears the outcome.
 */
export function afterResult(outcome: SandboxOutcome, check: SandboxCheckFacts): SandboxCheckFacts {
  if (outcome.kind === "setup" && outcome.how === "check_failed") {
    return { state: "needs-repair", reason: outcome.reason };
  }
  return check;
}
