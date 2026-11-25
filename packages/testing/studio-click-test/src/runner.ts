import type { Driver } from "./webdriver.ts";

/** What one step found: passed, or failed with the error code the screen showed. */
export type StepOutcome =
  | { passed: true; note?: string }
  | { passed: false; code: string; note: string };

/** What a step gets to work with. */
export interface StepContext {
  /** The session on the installed Studio. */
  readonly driver: Driver;
  /** The throwaway Paperclip's address. */
  readonly paperclipUrl: string;
  /** Waits for the given time; tests pass one that returns at once. */
  readonly sleep: (milliseconds: number) => Promise<void>;
  /** The last `engine` and `agent host` lines of Studio's shell log, for evidence. */
  readonly shellLog: () => Promise<string>;
  /** Opens a Start menu shortcut, such as "Halonic Messenger", as a person would. */
  readonly openShortcut: (name: string) => Promise<void>;
  /** The handle of Studio's main window, which the session started on. */
  readonly mainWindow: string;
  /**
   * Approves, as the throwaway Paperclip's board, the sign-in Studio just
   * started there. Resolves to why it couldn't, or undefined once approved.
   */
  readonly approveSignIn: () => Promise<string | undefined>;
}

/** One step of the click test, as a person would do it. */
export interface Step {
  /** A short id, used in the screenshot's file name. */
  readonly id: string;
  /** What the step checks, as the results table says it. */
  readonly title: string;
  /** The ids of earlier steps it can't do without; it is skipped when one didn't pass. */
  readonly needs?: readonly string[];
  /** Clicks through the step and says whether the right screen showed. */
  run(context: StepContext): Promise<StepOutcome>;
}

/** One row of the results table. */
export interface StepResult {
  readonly number: number;
  readonly id: string;
  readonly title: string;
  readonly verdict: "passed" | "failed" | "skipped" | "not run";
  readonly code?: string;
  readonly note?: string;
  readonly screenshot?: string;
}

/** Where the runner keeps a step's screenshot. */
export type SaveScreenshot = (fileName: string, png: Uint8Array) => Promise<void>;

/** Closes the app, starts it again and attaches, and returns the new context. */
export type RestartApp = () => Promise<StepContext>;

/**
 * Runs every step in order, with a screenshot after each one that ran. After
 * a failing step it restarts the app and goes on, so one run lists every
 * failure (the board, HAL-18353). A step whose needed step didn't pass is
 * "skipped"; if the app won't restart, the rest are "not run".
 */
export async function runSteps(
  steps: readonly Step[],
  first: StepContext,
  saveScreenshot: SaveScreenshot,
  restart: RestartApp,
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  let context = first;
  let broken: string | undefined;
  for (const [index, step] of steps.entries()) {
    const number = index + 1;
    const row = { number, id: step.id, title: step.title };
    const missing = results.find(
      (result) => step.needs?.includes(result.id) && result.verdict !== "passed",
    );
    if (missing !== undefined) {
      results.push({ ...row, verdict: "skipped", note: `needs step ${missing.number}` });
      continue;
    }
    if (broken !== undefined) {
      results.push({ ...row, verdict: "not run", note: broken });
      continue;
    }
    const result = await runAndRecord(step, row, context, saveScreenshot);
    results.push(result);
    if (result.verdict === "failed" && index < steps.length - 1) {
      try {
        context = await restart();
      } catch (error) {
        broken = `the app didn't restart after step ${number}: ${messageOf(error)}`;
      }
    }
  }
  return results;
}

async function runAndRecord(
  step: Step,
  row: Pick<StepResult, "number" | "id" | "title">,
  context: StepContext,
  saveScreenshot: SaveScreenshot,
): Promise<StepResult> {
  const outcome = await runOne(step, context);
  const screenshot = `${String(row.number).padStart(2, "0")}-${step.id}.png`;
  const saved = await takeScreenshot(context.driver, saveScreenshot, screenshot);
  const note = [outcome.note, saved].filter((part) => part !== undefined && part !== "").join(" ");
  const base = { ...row, screenshot, ...(note === "" ? {} : { note }) };
  if (outcome.passed) return { ...base, verdict: "passed" };
  return { ...base, verdict: "failed", code: outcome.code };
}

async function runOne(step: Step, context: StepContext): Promise<StepOutcome> {
  try {
    return await step.run(context);
  } catch (error) {
    // A step that throws failed in the test itself, not on a screen: say so
    // with the message, so the table never blames the app for a driver error.
    return { passed: false, code: "STEP_ERROR", note: messageOf(error) };
  }
}

async function takeScreenshot(
  driver: Driver,
  save: SaveScreenshot,
  fileName: string,
): Promise<string | undefined> {
  try {
    await save(fileName, await driver.screenshot());
    return undefined;
  } catch (error) {
    return `(no screenshot: ${messageOf(error)})`;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
