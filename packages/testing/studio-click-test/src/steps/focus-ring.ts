import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { pollEveryMs, waitForText } from "../screen.ts";
import { type Focused, keys } from "../webdriver.ts";
import { buttonLabels } from "../words.ts";
import { closesToWelcome } from "./close-workspace.ts";
import { openDemo } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/** How long the demo may take, once Open demo is clicked, to open its first page and focus its title. */
const focusWaitMs = 30_000;

/** `<html>`, which the shell marks with how the user last acted, `data-input`. */
const root = "/html";

/**
 * Step 28 (HAL-20621): after a click on Open demo, the title of the page the demo opens on has
 * focus but no ring, and the window is marked `data-input="pointer"`; Shift alone leaves that
 * mark, and the next key, Tab, marks it `keyboard` (`shell.focus-ring-after-pointer`). It closes
 * the demo first, so the click comes from Welcome, as in the requirement's example.
 */
export const focusRingAfterPointer: Step = {
  id: "focus-ring-after-pointer",
  title: "After Open demo, the page title has focus but no ring until a key is pressed",
  requirements: ["shell.focus-ring-after-pointer"],
  run: async (context) => {
    const welcome = await onWelcome(context);
    if (!welcome.passed) return welcome;
    const opened = await openDemo(context);
    if (!opened.passed) return opened;
    const focused = await waitForCodeFocus(context);
    const afterPointer = await pointerFault(context, focused);
    if (afterPointer !== undefined) return afterPointer;
    return (await keyboardFault(context)) ?? { passed: true, note: `Focus: ${named(focused)}.` };
  },
};

/** Puts the main window on Welcome: as it is after a restart, or by closing the demo. */
async function onWelcome(context: StepContext): Promise<StepOutcome> {
  await context.driver.switchToWindow(context.mainWindow);
  const { text } = await waitForText(context, 30_000, (read) =>
    read.trim() === "" ? undefined : read,
  );
  if (text.includes(buttonLabels.openDemo.text)) return { passed: true };
  return inWideWindow(context, () => closesToWelcome(context));
}

/** The focused element once it is one code focused, or what has focus when the wait ends. */
async function waitForCodeFocus(context: StepContext): Promise<Focused | undefined> {
  let focused: Focused | undefined;
  const reads = Math.ceil(focusWaitMs / pollEveryMs);
  for (let read = 0; read < reads; read += 1) {
    focused = await context.driver.focused().catch(() => undefined);
    if (focused?.codeFocused === true) return focused;
    await context.sleep(pollEveryMs);
  }
  return focused;
}

/** Why the title after the click fails the requirement, or undefined when it holds. */
async function pointerFault(
  context: StepContext,
  focused: Focused | undefined,
): Promise<StepOutcome | undefined> {
  if (focused?.codeFocused !== true) {
    const note = `Focus is on ${named(focused)}, not on a title code focused.`;
    return { passed: false, code: "NO_CODE_FOCUS", note };
  }
  const mark = await inputMark(context);
  if (mark !== "pointer") {
    const note = `After the click the window is marked data-input=${mark}, not pointer.`;
    return { passed: false, code: "NOT_MARKED_POINTER", note };
  }
  if (focused.boxShadow !== "none") {
    const note = `${named(focused)} shows a ring after the click (box-shadow ${focused.boxShadow}).`;
    return { passed: false, code: "RING_AFTER_POINTER", note };
  }
  return undefined;
}

/** Why the key presses after it fail the requirement, or undefined when they hold. */
async function keyboardFault(context: StepContext): Promise<StepOutcome | undefined> {
  await context.driver.pressKeys([keys.shift]);
  const afterShift = await inputMark(context);
  if (afterShift !== "pointer") {
    const note = `Shift alone marked the window data-input=${afterShift}; a modifier alone isn't a key press.`;
    return { passed: false, code: "MODIFIER_MARKED_KEYBOARD", note };
  }
  await context.driver.pressKeys([keys.tab]);
  const afterTab = await inputMark(context);
  if (afterTab === "keyboard") return undefined;
  const note = `After Tab the window is marked data-input=${afterTab}, not keyboard.`;
  return { passed: false, code: "NOT_MARKED_KEYBOARD", note };
}

async function inputMark(context: StepContext): Promise<string> {
  return (await context.driver.attribute(root, "data-input")) ?? "(none)";
}

function named(focused: Focused | undefined): string {
  return focused === undefined ? "the page" : `${focused.tag} "${focused.text}"`;
}
