/**
 * How far Studio's start has got, as the desktop app's window reports it (`start_status`,
 * HAL-13408), and what Welcome makes of it (first-run-progress 3.2).
 */

/** Where the start is: `still_starting` from 30 s, `failed` at 60 s or as soon as it fails. */
export type StartState = "starting" | "still_starting" | "ready" | "failed";

/** The last phase the start reached. It goes into the report only; the screen never names it. */
export type StartPhase = "page_loaded" | "engine_ready" | "wsl_ready" | "host_started";

/**
 * Why a start failed. A cause the window doesn't send yet, or one from a newer window, reads as
 * `other`. `runtime_missing` is Owen's next cause (HAL-14633): until the window sends it, a WSL
 * distro without its runtime arrives as `other`.
 */
export type StartCause =
  | "timed_out"
  | "missing"
  | "broken"
  | "blocked"
  | "stopped"
  | "wsl_missing"
  | "distro_missing"
  | "runtime_missing"
  | "wsl_failed"
  | "other";

/** The causes Welcome shows as a failed start: the rest only say the sandbox isn't set up. */
export type FailedCause = Exclude<StartCause, "wsl_missing" | "distro_missing" | "runtime_missing">;

/** What `start_status` answers: fixed values and numbers only, never a message, a path or a name. */
export interface StartReport {
  readonly state: StartState;
  readonly phase: StartPhase;
  /** Set only when the state is `failed`. */
  readonly cause: StartCause | null;
  /** Set only for `stopped` and `wsl_failed`; `null` after a signal. */
  readonly exitCode: number | null;
  /** Whole seconds since the page loaded, or since the last new try. */
  readonly seconds: number;
}

/** One answer of the window's lite check (`lite_check`): an id and a fact, never a path. */
export type LiteCheckResult =
  | { readonly id: "app_files"; readonly fact: "present" | "missing" }
  | { readonly id: "profile_writable"; readonly fact: "writable" | "not_writable" | "no_profile" }
  | {
      readonly id: "disk_space";
      readonly fact: "enough" | "low" | "unknown";
      /** Set with `low`. */
      readonly freeBytes?: number;
    }
  | {
      readonly id: "wsl_distro";
      readonly fact: "present" | "missing" | "wsl_missing" | "unknown";
    }
  | {
      readonly id: "wsl_runtime";
      readonly fact: "present" | "missing" | "unknown" | "not_checked";
    };

/**
 * What Welcome needs from the app to show the start: the desktop app's window gives it; a served
 * Studio has no window to ask, so its Welcome shows no start at all.
 */
export interface WelcomeStart {
  /** The window's last answer, `undefined` until the first one. */
  readonly report: StartReport | undefined;
  /** Calls `onChange` after each new answer; returns the way to stop. */
  subscribe(onChange: () => void): () => void;
  /** **Try again**: a new start, with the timer from zero. Resolves once the window has the try. */
  tryAgain(): Promise<void>;
  /** **Check this computer**: the checks the window can do without the engine. */
  check(): Promise<readonly LiteCheckResult[]>;
  /** Halonic's version and the system, for the report: "Halonic 0.1.0 · Windows". */
  readonly about: string;
}

/** What Welcome shows of the start. */
export type StartView =
  | { readonly kind: "ready" }
  | { readonly kind: "waiting"; readonly seconds: number; readonly still: boolean }
  | {
      readonly kind: "failed";
      readonly cause: FailedCause;
      readonly exitCode: number | null;
      readonly seconds: number;
    };

/**
 * The causes that only say the sandbox isn't set up yet. On Windows that's the normal state
 * before the user sets it up, and the demo doesn't use it, so Welcome counts them as ready
 * (first-run-progress 3.2 and section 8, Sofia on HAL-13428). Settings, the Inbox and the run
 * page say it where the sandbox is used.
 */
const sandboxNotSetUp: ReadonlySet<string> = new Set<StartCause>([
  "wsl_missing",
  "distro_missing",
  "runtime_missing",
]);

const failedCauses: ReadonlySet<string> = new Set<FailedCause>([
  "timed_out",
  "missing",
  "broken",
  "blocked",
  "stopped",
  "wsl_failed",
  "other",
]);

/**
 * What Welcome shows for the window's answer. Before the first answer it waits, which shows
 * nothing for the first 2 seconds.
 *
 * @example
 * startView({ state: "failed", phase: "engine_ready", cause: "distro_missing", exitCode: null, seconds: 1 });
 * // { kind: "ready" }
 */
export function startView(report: StartReport | undefined): StartView {
  if (report === undefined) {
    return { kind: "waiting", seconds: 0, still: false };
  }
  if (report.state === "ready") {
    return { kind: "ready" };
  }
  if (report.state === "failed") {
    const cause = report.cause ?? "other";
    if (sandboxNotSetUp.has(cause)) {
      return { kind: "ready" };
    }
    return {
      kind: "failed",
      cause: failedCauses.has(cause) ? (cause as FailedCause) : "other",
      exitCode: report.exitCode,
      seconds: report.seconds,
    };
  }
  return { kind: "waiting", seconds: report.seconds, still: report.state === "still_starting" };
}
