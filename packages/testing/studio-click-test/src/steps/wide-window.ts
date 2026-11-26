import type { StepContext, StepOutcome } from "../runner.ts";
import type { WindowSize } from "../webdriver.ts";

/**
 * The size the Studio basics steps give the window. The installed app opens at 800 × 600, a
 * narrow window (600 to 899px, `shell.places-drawer`), where the sidebar and its workspace
 * switcher sit behind ☰ Places and the Open tabs strip folds into "1 open tab ▾" (run
 * 45731878661), so the switcher and the strip these steps check show only in a wider one.
 */
export const wideWindow: WindowSize = { width: 1280, height: 800 };

/** From this width on, Studio docks the sidebar and shows the Open tabs strip. */
const dockedFromWidth = 900;

/**
 * Runs `step` in a window of {@link wideWindow}'s size, then gives the window its size back, so
 * the steps after it, which expect the narrow window, find ☰ Places where they look for it.
 * Fails as `NO_WIDE_WINDOW` when the window can't be made wide, and as `WINDOW_NOT_RESTORED`
 * when a step that passed can't give the size back.
 */
export async function inWideWindow(
  context: StepContext,
  step: () => Promise<StepOutcome>,
): Promise<StepOutcome> {
  const { driver } = context;
  const sized = await driver
    .windowSize()
    .then(async (before) => ({ before, wide: await driver.setWindowSize(wideWindow) }))
    .catch(errorText);
  if (typeof sized === "string") {
    return { passed: false, code: "NO_WIDE_WINDOW", note: `The window can't be sized (${sized}).` };
  }
  const { before, wide } = sized;
  if (wide.width < dockedFromWidth) {
    const note = `The window stayed ${wide.width} × ${wide.height}, too narrow for the sidebar.`;
    return { passed: false, code: "NO_WIDE_WINDOW", note };
  }
  const restore = () => driver.setWindowSize(before).then(() => undefined, errorText);
  const outcome = await step().catch(async (error: unknown) => {
    // A step that threw keeps its own error; the runner's restart resets the window anyway.
    await restore();
    throw error;
  });
  const whyNot = await restore();
  if (whyNot === undefined) return outcome;
  const kept = `The window kept ${wide.width} × ${wide.height} (${whyNot}).`;
  if (outcome.passed) return { passed: false, code: "WINDOW_NOT_RESTORED", note: kept };
  return { ...outcome, note: `${outcome.note} ${kept}` };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
