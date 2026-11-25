import type { StepContext, StepOutcome } from "../runner.ts";
import { clickOrWhyNot, clickWhenShown, lastWords, waitForText } from "../screen.ts";
import { buttonLabels, errorCodeIn } from "../words.ts";

/** How long Studio may take to start its engine on a fresh profile (the WSL import included). */
export const startWaitMs = 5 * 60_000;

/**
 * Opens the demo from Welcome. Welcome keeps Open demo off until the engine
 * runs, so a click that lands is itself the first sign the engine started.
 */
export async function openDemo(context: StepContext): Promise<StepOutcome> {
  const { openDemo, trust } = buttonLabels;
  const whyNot = await clickOrWhyNot(context, openDemo.text, startWaitMs);
  if (whyNot !== undefined) {
    const { text } = await waitForText(context, 0, () => undefined);
    const seen = text === "" ? "" : ` Screen: ${lastWords(text)}`;
    return {
      passed: false,
      code: errorCodeIn(text) ?? "ENGINE_NOT_STARTED",
      note: `${openDemo.text} never turned on (last click: ${whyNot}).${seen}`,
    };
  }
  // The trust check shows only for a workspace with runnable files; no dialog is fine.
  await clickWhenShown(context, trust.text, 20_000);
  return { passed: true };
}

/**
 * Puts the main window on a workspace: a restarted app opens on Welcome
 * (run 45665141501), where Settings isn't, so a step after a restart opens
 * the demo again first.
 */
export async function onWorkspace(context: StepContext): Promise<StepOutcome> {
  await context.driver.switchToWindow(context.mainWindow);
  const { text } = await waitForText(context, 30_000, (read) =>
    read.trim() === "" ? undefined : read,
  );
  if (!text.includes(buttonLabels.openDemo.text)) return { passed: true };
  return openDemo(context);
}
