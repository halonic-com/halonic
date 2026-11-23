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
  | {
      readonly state: "needs-setup";
      /** The setup is on this computer, but for an older release of the sandbox (HAL-5404). */
      readonly setupAgain?: true;
      /**
       * A removal with administrator rights left some access that only removing it again without
       * them takes back (`keptAccess: "manual"`), so **Remove the sandbox…** shows too (HAL-15851).
       */
      readonly accessKept?: true;
    }
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
  /** The shell's helper still ran at its time limit and was left to finish (HAL-15091). */
  | { readonly kind: "remove"; readonly how: "timed-out" }
  /** The helper of an earlier press still runs; Windows wasn't asked again (HAL-15091). */
  | { readonly kind: "remove"; readonly how: "still-running" }
  | {
      readonly kind: "remove";
      readonly how: "failed";
      readonly reason: string;
      readonly details?: string;
    }
  | { readonly kind: "remove"; readonly how: "in-use"; readonly runs: number };

/**
 * Some access Halonic gave its sandbox that a removal with administrator rights kept: until Halonic
 * next starts (HAL-15761), or until the sandbox is removed again without them, `manual`
 * (HAL-15836) (`sandbox-srt.removal-kept-access`).
 */
export type KeptAccess = "until_next_start" | "manual";

/** A removal that worked, and the access it kept, if any. */
export interface SandboxRemoved {
  readonly kind: "remove";
  readonly how: "removed";
  readonly keptAccess?: KeptAccess;
}

/**
 * What the section shows after a press: how it failed, or a removal that worked, which the host
 * reports as no outcome, or as {@link SandboxRemoved} when it kept access, and the section says in
 * a note (C575, HAL-15432).
 */
export type SandboxResult = SandboxOutcome | SandboxRemoved;

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
  readonly outcome: SandboxResult | null;
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
  /** A second line under the lead: why **Remove the sandbox…** shows while access is kept (C728-1). */
  readonly leadNote: string | null;
  /**
   * The failure Callout, with **Try again** when the same command can run again, or **Copy details**
   * for an internal error, which trying again would only hit again (microcopy 22 F13).
   */
  readonly callout: {
    readonly line: string;
    readonly action: "try-again" | "copy-details" | null;
    /** A note rather than a failure (an earlier setup still running, a removal that worked), in the info tone. */
    readonly note?: true;
  } | null;
  readonly steps: readonly SandboxStep[];
  /**
   * The check found why the sandbox can't run: the section draws these words, with their own
   * **Check again** and guide, in place of the lead and the buttons.
   */
  readonly notAvailable: NotAvailableWords | null;
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

/** What Not available says when a check found why (23.3): the reason, its fix and the guide. */
export interface NotAvailableWords {
  readonly reason: string;
  /** None where the section's own set-up button is the fix (23.3a). */
  readonly fix: string | null;
  readonly docs: { readonly name: string; readonly href: string };
  /** The muted last line: running an agent after a warning, said for where the person is. */
  readonly wayRound: string;
}

const none = {
  chip: null,
  leadNote: null,
  callout: null,
  steps: [],
  notAvailable: null,
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
      return needsSetupView(check, viewOnly, callout);
  }
}

/**
 * Needs setting up, with **Remove the sandbox…** and the line that says why while a removal with
 * administrator rights kept some access that only removing it again without them takes back
 * (HAL-15851, C728-1); both only where the person can press it, so not in served Studio.
 */
function needsSetupView(
  check: Extract<SandboxCheckFacts, { state: "needs-setup" }>,
  viewOnly: boolean,
  callout: SandboxView["callout"],
): SandboxView {
  const accessKept = check.accessKept === true && !viewOnly;
  return {
    ...none,
    chip: { label: "Needs setting up", tone: "warning" },
    // A setup from an older release says it is needed again (C633).
    lead: check.setupAgain === true ? text.NEEDS_SETUP_AGAIN : text.NEEDS_SETUP,
    leadNote: accessKept ? text.ACCESS_KEPT : null,
    callout,
    hint: viewOnly ? text.VIEW_ONLY : text.ADMIN_ONCE,
    primary: viewOnly ? null : { action: "set-up", label: text.SET_UP, busy: false },
    secondary: accessKept ? ["check-again", "remove"] : ["check-again"],
  };
}

/**
 * A reason the person or an administrator fixes (23.3, "Settings › Agent sandbox, not available"):
 * the chip, then the reason, its fix, **Check again**, the guide and the way round it, which the
 * section draws as it does for the start check's reason (C701-1).
 */
function unavailableView(code: string, viewOnly: boolean): SandboxView {
  return {
    ...none,
    chip: { label: "Not available", tone: "attention" },
    lead: "",
    notAvailable: notAvailableWords(code, viewOnly),
  };
}

/**
 * The words for a reason code, from the sandbox-start catalogue. Where the section's own button is
 * the fix, there is none (23.3a); served Studio is used from another device, so `viewOnly` gets the
 * fix and the way round that say to do it on the computer (C711-2).
 *
 * @example
 * notAvailableWords("setup-needed", false).fix; // null
 */
export function notAvailableWords(code: string, viewOnly: boolean): NotAvailableWords {
  const words = sandboxStartWords(code);
  return {
    reason: words.reason,
    fix: viewOnly ? words.phoneFix : words.settingsFix,
    docs: { name: words.docsName, href: `${text.DOCS_ADDRESS}/${words.docsKey}` },
    wayRound: viewOnly ? text.RUN_THERE_AFTER_WARNING : text.RUN_HERE_AFTER_WARNING,
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

/** The line of the Callout an outcome shows, as the section says it once (HAL-15091). */
export function outcomeLine(outcome: SandboxOutcome): string {
  return calloutFor(outcome).line;
}

function calloutFor(outcome: SandboxResult): NonNullable<SandboxView["callout"]> {
  if (outcome.kind === "remove") {
    switch (outcome.how) {
      case "removed":
        return { line: text.removedLine(outcome.keptAccess), action: null, note: true };
      case "cancelled":
        return { line: text.REMOVE_DENIED, action: null };
      case "timed-out":
        return { line: text.REMOVE_TOOK_TOO_LONG, action: null };
      case "still-running":
        return { line: text.REMOVE_STILL_RUNNING, action: null, note: true };
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
