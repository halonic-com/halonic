import { sandboxStartWords } from "@halonicjs/app";
import * as text from "./sandbox-text.ts";
import { SETUP_LIMIT_MINUTES } from "./setup-limit.ts";

/** {@link SETUP_LIMIT_MINUTES} in milliseconds. */
export const SETUP_TIME_LIMIT_MS = SETUP_LIMIT_MINUTES * 60 * 1000;

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
  | {
      readonly state: "ready";
      readonly checkedAt: string;
      /** The check saw Docker Desktop next to the sandbox (W6, HAL-12445): a warning, not a failure. */
      readonly dockerDesktopVisible?: boolean;
    }
  | { readonly state: "needs-setup" }
  | { readonly state: "needs-repair"; readonly reason: string }
  /**
   * The check ran and says the sandbox can't run now, for a reason a person or an administrator
   * fixes: its code, which the section words from the sandbox-start catalogue.
   */
  | { readonly state: "unavailable"; readonly code: string }
  /** The setup is done, but Windows must restart before the sandbox can run. */
  | { readonly state: "restart-needed" }
  /** The first check hasn't answered yet: no result to show, and no failure either. */
  | { readonly state: "checking" }
  /**
   * The check itself didn't happen or couldn't be read. `details`, for an internal error only, is
   * what **Copy details** puts on the clipboard (microcopy 22 F13).
   */
  | { readonly state: "unknown"; readonly reason: string; readonly details?: string };

/**
 * How the last setup, repair or removal ended, when it failed. A `failed` command's `details`, for
 * an internal error only, is what **Copy details** puts on the clipboard (microcopy 22 F13).
 */
export type SandboxOutcome =
  | { readonly kind: "setup"; readonly how: "cancelled" }
  | { readonly kind: "setup"; readonly how: "timed-out"; readonly repairing: boolean }
  /** Try again while the helper of an earlier press still runs; Windows wasn't asked again. */
  | { readonly kind: "setup"; readonly how: "still-running"; readonly repairing: boolean }
  | {
      readonly kind: "setup";
      readonly how: "failed";
      readonly reason: string;
      readonly details?: string;
    }
  | { readonly kind: "setup"; readonly how: "check_failed"; readonly reason: string }
  | { readonly kind: "remove"; readonly how: "cancelled" }
  | {
      readonly kind: "remove";
      readonly how: "failed";
      readonly reason: string;
      readonly details?: string;
    }
  | { readonly kind: "remove"; readonly how: "in-use"; readonly runs: number };

/**
 * What runs now: the elevated step, then the check that follows it. `running` is a command the
 * section joined: it may be past the administrator prompt, so no step claims to wait for it.
 */
export interface SandboxRunning {
  readonly verb: "setup" | "repair" | "remove";
  readonly step: "elevating" | "running" | "checking";
}

export interface SandboxFacts {
  /** False on Windows builds without the sandbox (D44 c). */
  readonly available: boolean;
  /** Served Studio and the phone only look (IU 13.6). */
  readonly place: "app" | "served";
  readonly check: SandboxCheckFacts;
  readonly running: SandboxRunning | null;
  readonly outcome: SandboxOutcome | null;
  /** A **Check again** is out: the last result stays and the button is busy. */
  readonly rechecking?: boolean;
  /** The host says the sandbox's security updates are overdue: one warning line, not blocking. */
  readonly securityUpdatesOverdue?: boolean;
  /** The host says the sandbox is the person's default WSL distro: one warning line, not blocking. */
  readonly defaultDistro?: boolean;
}

export type ChipTone = "attention" | "neutral" | "success" | "warning";
export type SandboxAction = "remove" | "check-again" | "copy-details";

export interface SandboxStep {
  readonly mark: "done" | "doing" | "waiting";
  readonly label: string;
  readonly note?: string;
}

export interface SandboxView {
  readonly chip: { readonly label: string; readonly tone: ChipTone } | null;
  readonly lead: string;
  /**
   * The failure Callout, with **Try again** when the same command can run again, or **Copy details**
   * for an internal error, which trying again would only hit again (microcopy 22 F13).
   */
  readonly callout: {
    readonly line: string;
    readonly action: "try-again" | "copy-details" | null;
    /** A note rather than a failure (an earlier setup still running), in the info tone. */
    readonly note?: true;
  } | null;
  readonly steps: readonly SandboxStep[];
  /** The guide for what the check found, after the buttons. */
  readonly docs: { readonly name: string; readonly href: string } | null;
  /** Under the buttons. */
  readonly hint: string | null;
  /** The primary button, if one shows, and whether it is busy. */
  readonly primary: {
    readonly action: "set-up" | "repair";
    readonly label: string;
    readonly busy: boolean;
  } | null;
  readonly secondary: readonly SandboxAction[];
  /** **Check again** is busy: a check is out. */
  readonly checkBusy: boolean;
  /** What **Copy details** puts on the clipboard, when the Callout or the buttons offer it. */
  readonly details: string | null;
}

const none = {
  chip: null,
  callout: null,
  steps: [],
  docs: null,
  hint: null,
  primary: null,
  secondary: [],
  checkBusy: false,
  details: null,
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
    return {
      ...none,
      lead: text.NOT_AVAILABLE,
      chip: { label: "Not available", tone: "attention" },
    };
  const { check, running, outcome } = facts;
  const callout = outcome ? calloutFor(outcome) : null;

  if (running) return busyView(running, check);

  const view = checkedView(check, facts.place === "served", callout, now);
  return {
    ...view,
    checkBusy: facts.rechecking === true,
    // The Callout's internal error comes first: it is the newer one.
    details: (outcome && "details" in outcome ? outcome.details : undefined) ?? view.details,
  };
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
        chip: { label: "Needs repair", tone: "attention" },
        lead: text.needsRepair(check.reason),
        callout,
        hint: hint(text.REPAIR_HINT),
        primary: viewOnly ? null : { action: "repair", label: text.REPAIR, busy: false },
        secondary: viewOnly ? ["check-again"] : ["check-again", "remove"],
      };
    case "unavailable":
      return { ...unavailableView(check.code, viewOnly), callout };
    case "restart-needed":
      return {
        ...none,
        chip: { label: "Restart needed", tone: "attention" },
        lead: text.RESTART_NEEDED,
        callout,
        secondary: ["check-again"],
      };
    case "checking":
      return { ...none, lead: text.CHECKING };
    case "unknown":
      return cannotCheckView(check.reason, check.details, callout);
    case "needs-setup":
      return {
        ...none,
        chip: { label: "Needs setting up", tone: "warning" },
        lead: text.NEEDS_SETUP,
        callout,
        hint: hint(text.ADMIN_ONCE),
        primary: viewOnly ? null : { action: "set-up", label: text.SET_UP, busy: false },
        secondary: ["check-again"],
      };
  }
}

/**
 * A reason the person or an administrator fixes (23.3, "Settings › Agent sandbox, not available"):
 * the chip, the reason and its fix, **Check again**, the guide, then the way round it. Where the
 * section's own button is the fix, the fix line is left out (23.3a); served Studio is used from
 * another device, so it gets the fix that says to do it on the computer.
 */
function unavailableView(code: string, viewOnly: boolean): SandboxView {
  const words = sandboxStartWords(code);
  const fix = viewOnly ? words.phoneFix : words.settingsFix;
  return {
    ...none,
    chip: { label: "Not available", tone: "attention" },
    lead: fix === null ? words.reason : `${words.reason} ${fix}`,
    docs: { name: words.docsName, href: `${text.DOCS_ADDRESS}/${words.docsKey}` },
    hint: text.RUN_HERE_AFTER_WARNING,
    secondary: ["check-again"],
  };
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
    running.step !== "checking"
      ? [
          running.step === "elevating"
            ? { mark: "doing", label: doing, note: text.UAC_WAITING }
            : { mark: "doing", label: doing },
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
        return {
          line: text.removeFailed(outcome.reason),
          action: outcome.details === undefined ? null : "copy-details",
        };
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
    case "still-running":
      return {
        line: outcome.repairing ? text.REPAIR_STILL_RUNNING : text.STILL_RUNNING,
        action: "try-again",
        note: true,
      };
    case "failed":
      return {
        line: text.failedSetUp(outcome.reason),
        action: outcome.details === undefined ? "try-again" : "copy-details",
      };
    case "check_failed":
      return { line: text.failedCheck(outcome.reason), action: "try-again" };
  }
}

/** Whether a setup that began at `startedAt` has run past the time limit. */
export function setupTimedOut(startedAt: number, now: number): boolean {
  return now - startedAt >= SETUP_TIME_LIMIT_MS;
}

/**
 * A check that couldn't run. An internal error puts its line in the same warning Callout, with
 * **Copy details**, that a failed setup or removal uses (C446-2), unless a setup or removal Callout
 * is already there; then the line stays the lead and Copy details sits next to **Check again**.
 */
function cannotCheckView(
  reason: string,
  details: string | undefined,
  callout: SandboxView["callout"],
): SandboxView {
  const line = text.cannotCheck(reason);
  const again: SandboxAction[] = ["check-again"];
  if (details === undefined) return { ...none, lead: line, callout, secondary: again };
  if (callout === null) {
    return {
      ...none,
      lead: "",
      callout: { line, action: "copy-details" },
      secondary: again,
      details,
    };
  }
  return { ...none, lead: line, callout, secondary: [...again, "copy-details"], details };
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
