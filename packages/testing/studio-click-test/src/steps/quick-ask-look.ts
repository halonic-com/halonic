import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { lastWords, pollEveryMs } from "../screen.ts";
import { keys } from "../webdriver.ts";
import { openAppWindow } from "./app-window.ts";
import { composerBoxOf, type Expected } from "./conversation-look.ts";

/** The box: the box window's dialog holding the question's text box. */
const box = "//section[@role='dialog'][.//textarea]";
const textarea = `${box}//textarea`;
const messageBox = composerBoxOf(textarea);

/** Quick ask's parts as the step finds them, by role and keys rather than words. */
export const quickAskParts = {
  box,
  messageBox,
  // Straight in the message box's row, as `order-first` draws it before the text only there.
  chip: `${messageBox}/button[@aria-haspopup='listbox']`,
  ask: `${messageBox}//button[@aria-keyshortcuts='Enter']`,
} as const;

/** How long the box may take to read the agents and show the chip in place of its skeleton. */
const chipWaitMs = 30_000;

/**
 * The dialogs' own shadow layer (`shadow-3`), as the computed `box-shadow` writes it. The dark ring
 * and the shadow's edge share that list, so the list alone is never `none` (Nora on #6891).
 */
const dialogShadowLayer = "0px 24px 48px -12px";

/** What the new design draws for the box and its message box (HAL-20746). */
export const quickAskLook = {
  box: [{ property: "border-top-left-radius", value: "8px" }],
  messageBox: [{ property: "border-top-left-radius", value: "26px" }],
} as const satisfies Record<string, readonly Expected[]>;

/**
 * Starts Halonic again with `--app ask`, which the running Halonic answers by showing quick ask's
 * box in its `ask` window, then reads the box (`quick-ask.box-look`): the 8px panel corner with a
 * shadow, and the kit's 26px message box holding the agent chip, straight in its row, and Ask. The
 * window exists before its page draws and the chip is a skeleton until the agents arrive, so the
 * step waits for the chip first. Esc hides the box again, so the steps after it start on Studio's
 * window.
 */
export const quickAskBoxLook: Step = {
  id: "quick-ask-look",
  title: "Quick ask: the box on the panel corner, with the kit's message box",
  requirements: [
    "quick-ask.box-look",
    "studio.src-tauri.focused-apps",
    "studio.src-tauri.quick-ask-window",
  ],
  needs: ["connect-paperclip"],
  run: async (context) => {
    const window = await openAppWindow(
      context,
      "Halonic",
      (_text, label) => label === "ask",
      false,
      ["--app", "ask"],
    );
    if (!window.opened) {
      const note = `Halonic --app ask showed no ask window. Last: ${lastWords(window.text)}`;
      return { passed: false, code: "NO_WINDOW", note };
    }
    const outcome = await readBox(context);
    await context.driver.pressKeys([keys.escape]);
    await context.driver.switchToWindow(context.mainWindow);
    return outcome;
  },
};

/** Reads the shown box: every part there, then each drawn value, naming all that differ. */
export async function readBox(context: StepContext): Promise<StepOutcome> {
  const { driver } = context;
  await waitForChip(context);
  for (const [part, xpath] of Object.entries(quickAskParts)) {
    if ((await driver.count(xpath)) === 0) {
      return { passed: false, code: "NO_QUICK_ASK_PART", note: `The box has no ${part}.` };
    }
  }
  const wrong: string[] = [];
  for (const [part, expected] of [
    ["box", quickAskLook.box],
    ["messageBox", quickAskLook.messageBox],
  ] as const) {
    for (const { property, value } of expected) {
      const drawn = await driver.cssValue(quickAskParts[part], property);
      if (drawn !== value) wrong.push(`${part} ${property} ${drawn}, not ${value}`);
    }
  }
  const shadow = await driver.cssValue(box, "box-shadow");
  if (!shadow.includes(dialogShadowLayer)) wrong.push("box has no dialog shadow");
  if (wrong.length === 0) return { passed: true };
  return { passed: false, code: "QUICK_ASK_LOOK", note: `${wrong.join("; ")}.` };
}

/** Waits until the agent chip shows, up to 30s; reading the box then names a chip still missing. */
async function waitForChip(context: StepContext): Promise<void> {
  for (let read = 0; read < chipWaitMs / pollEveryMs; read += 1) {
    if ((await context.driver.count(quickAskParts.chip)) > 0) return;
    await context.sleep(pollEveryMs);
  }
}
