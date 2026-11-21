/** The four steps of the first run, in the order the first-run bar shows them (first-run-flow 2). */
export const firstRunSteps = ["demo", "model", "run", "approve"] as const;

/** One step of the first run. */
export type FirstRunStep = (typeof firstRunSteps)[number];

/**
 * The first run on this device (`first-run.state`), one for the device, not per folder:
 * - `off`: it never started here;
 * - `on`: it is going on in `folder`, at `step`, since the ISO time `since` (runs that started
 *   before don't count). `failed` marks a run that failed, `ended` one that ended without a win
 *   (cancelled, or its reply rejected); both are at the `run` step;
 * - `paused`: the user left it with **Skip, I'll explore** or **Set up later**, at `step`, so the
 *   Inbox's setup item can continue it;
 * - `done`: the first win happened in `folder`.
 */
export type FirstRunState =
  | { readonly kind: "off" }
  | {
      readonly kind: "on";
      readonly folder: string;
      readonly since: string;
      readonly step: FirstRunStep;
      readonly failed?: true;
      readonly ended?: true;
    }
  | {
      readonly kind: "paused";
      readonly folder: string;
      readonly since: string;
      readonly step: FirstRunStep;
    }
  | { readonly kind: "done"; readonly folder: string };

/**
 * What happens to the first run. A run event (`model-picking` to `first-win`) is about the folder
 * the first run is in; the caller sends it only from there.
 */
export type FirstRunEvent =
  /** **Open demo** opened a copy of Acme, at the ISO time `at`. */
  | { readonly kind: "demo-opened"; readonly folder: string; readonly at: string }
  /** **Show the guide** in Help: the first run begins again at Demo in `folder`. */
  | { readonly kind: "guide-reopened"; readonly folder: string; readonly at: string }
  /** **Start over** in Help: it is off, so the fresh copy of the demo starts it when it opens. */
  | { readonly kind: "reset" }
  | { readonly kind: "model-picking" }
  | { readonly kind: "run-started" }
  | { readonly kind: "run-waiting" }
  | { readonly kind: "run-failed" }
  /** The run was cancelled, or its reply rejected: it is over without a win. */
  | { readonly kind: "run-ended" }
  | { readonly kind: "first-win" }
  /** **Skip, I'll explore** or **Set up later**. */
  | { readonly kind: "left" }
  /** **Continue** on the Inbox's setup item. */
  | { readonly kind: "resumed" };

/** The state after `event`. An event that doesn't fit the state leaves it as it was. */
export function nextFirstRun(state: FirstRunState, event: FirstRunEvent): FirstRunState {
  switch (event.kind) {
    case "demo-opened":
      // Only the first demo starts it: a later copy, or the demo after a win, doesn't.
      return state.kind === "off" ? begun(event) : state;
    case "guide-reopened":
      return begun(event);
    case "reset":
      return off;
    case "left":
      return state.kind === "on" ? { ...where(state), kind: "paused", step: state.step } : state;
    case "resumed":
      return state.kind === "paused" ? { ...where(state), kind: "on", step: state.step } : state;
    case "first-win":
      return state.kind === "on" || state.kind === "paused"
        ? { kind: "done", folder: state.folder }
        : state;
    default:
      return state.kind === "on" ? { ...where(state), kind: "on", ...runStep(event) } : state;
  }
}

/** A first run that begins at the demo, in the event's folder, from its time on. */
function begun(event: { readonly folder: string; readonly at: string }): FirstRunState {
  return { kind: "on", folder: event.folder, since: event.at, step: "demo" };
}

/** Where a first run is going on: its folder and since when. */
function where(state: { readonly folder: string; readonly since: string }) {
  return { folder: state.folder, since: state.since };
}

/** Where a run event puts a first run that is on. */
function runStep(
  event: Extract<
    FirstRunEvent,
    { kind: "model-picking" | "run-started" | "run-waiting" | "run-failed" | "run-ended" }
  >,
): Pick<Extract<FirstRunState, { kind: "on" }>, "step" | "failed" | "ended"> {
  switch (event.kind) {
    case "model-picking":
      return { step: "model" };
    case "run-started":
      return { step: "run" };
    case "run-waiting":
      return { step: "approve" };
    case "run-failed":
      return { step: "run", failed: true };
    case "run-ended":
      return { step: "run", ended: true };
  }
}

/** The state as saved on the device. */
export function serializeFirstRun(state: FirstRunState): string {
  return JSON.stringify(state);
}

/**
 * The state saved in `text`. Text that can't be read, or isn't a state, counts as `off`, so a
 * broken save never stops a folder from opening; at worst the first run starts again.
 */
export function parseFirstRun(text: string | undefined): FirstRunState {
  if (text === undefined) return off;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return off;
  }
  return isFirstRunState(value) ? value : off;
}

const off: FirstRunState = { kind: "off" };

function isFirstRunState(value: unknown): value is FirstRunState {
  if (typeof value !== "object" || value === null) return false;
  const { kind, folder, since, step } = value as Record<string, unknown>;
  if (kind === "off") return true;
  if (typeof folder !== "string") return false;
  if (kind === "done") return true;
  return (kind === "on" || kind === "paused") && typeof since === "string" && isStep(step);
}

function isStep(value: unknown): value is FirstRunStep {
  return (firstRunSteps as readonly unknown[]).includes(value);
}
