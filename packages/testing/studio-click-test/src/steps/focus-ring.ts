import { runsPlaceText } from "../place-words.ts";
import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { placeNamed, pollEveryMs, waitForText } from "../screen.ts";
import { type Focused, keys } from "../webdriver.ts";
import { buttonLabels } from "../words.ts";
import { closesToWelcome } from "./close-workspace.ts";
import { openDemo } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/** How long a page may take, once opened, to show and focus its title. */
const focusWaitMs = 30_000;

/** `<html>`, which the shell marks with how the user last acted, `data-input`. */
const root = "/html";

/**
 * Step 32 (HAL-20621): after a click on Open demo, the title of the page the demo opens on has
 * focus but no ring, and the window is marked `data-input="pointer"`; Shift alone leaves that
 * mark, and the next key, Tab, marks it `keyboard`. Then Enter on Runs in Places opens that page,
 * and its title takes focus with the ring (`shell.focus-ring-after-pointer`). It closes the demo
 * first, so the click comes from Welcome, as in the requirement's example. In a wide window,
 * where Places shows in the sidebar.
 */
export const focusRingAfterPointer: Step = {
  id: "focus-ring-after-pointer",
  title: "After Open demo, the page title has focus but no ring until a key is pressed",
  requirements: ["shell.focus-ring-after-pointer"],
  run: (context) => inWideWindow(context, () => checkFocusRing(context)),
};

async function checkFocusRing(context: StepContext): Promise<StepOutcome> {
  const welcome = await onWelcome(context);
  if (!welcome.passed) return welcome;
  const opened = await openDemo(context);
  if (!opened.passed) return opened;
  const focused = await waitForTitleFocus(context);
  const afterPointer = await pointerFault(context, focused);
  if (afterPointer !== undefined) return afterPointer;
  const afterKeys = await keyboardFault(context);
  if (afterKeys !== undefined) return afterKeys;
  const ringed = await ringAfterKeyFault(context, focused);
  if (ringed !== undefined) return ringed;
  return { passed: true, note: `Focus: ${named(focused)}.` };
}

/** Puts the main window on Welcome: as it is after a restart, or by closing the demo. */
async function onWelcome(context: StepContext): Promise<StepOutcome> {
  const { text } = await waitForText(context, 30_000, (read) =>
    read.trim() === "" ? undefined : read,
  );
  if (text.includes(buttonLabels.openDemo.text)) return { passed: true };
  return closesToWelcome(context);
}

/**
 * The focused element once it is a page's title code focused, an `h1`, and not `before`; or what
 * has focus when the wait ends. Only an `h1`: Welcome's start line is code focused too, and the
 * check must be on the page the click opened.
 */
async function waitForTitleFocus(
  context: StepContext,
  before?: Focused,
): Promise<Focused | undefined> {
  let focused: Focused | undefined;
  const reads = Math.ceil(focusWaitMs / pollEveryMs);
  for (let read = 0; read < reads; read += 1) {
    focused = await context.driver.focused().catch(() => undefined);
    if (isPageTitle(focused) && focused?.text !== before?.text) return focused;
    await context.sleep(pollEveryMs);
  }
  return focused;
}

function isPageTitle(focused: Focused | undefined): boolean {
  return focused?.codeFocused === true && focused.tag === "H1";
}

/** Why the title after the click fails the requirement, or undefined when it holds. */
async function pointerFault(
  context: StepContext,
  focused: Focused | undefined,
): Promise<StepOutcome | undefined> {
  if (focused === undefined || !isPageTitle(focused)) {
    const note = `Focus is on ${named(focused)}, not on a page title code focused.`;
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

/**
 * Why the next page's title shows no ring once a key opened it, or undefined when it does. Enter
 * goes to Runs through WebDriver's element keys, which focus the place without a pointer press, so
 * the title the page focuses comes after a key, as in the requirement's second example. Each
 * engine rings a focus from code after a key, so this is the half WebView2 can show too.
 */
async function ringAfterKeyFault(
  context: StepContext,
  before: Focused | undefined,
): Promise<StepOutcome | undefined> {
  await context.driver.type(placeNamed(runsPlaceText.text), keys.enter);
  const focused = await waitForTitleFocus(context, before);
  if (focused === undefined || !isPageTitle(focused) || focused.text === before?.text) {
    const note = `After Enter on ${runsPlaceText.text}, focus is on ${named(focused)}, not on its page's title.`;
    return { passed: false, code: "NO_RING_AFTER_KEY", note };
  }
  if (focused.boxShadow !== "none" && focused.boxShadow !== "") return undefined;
  const note = `${named(focused)} took focus after a key but shows no ring (box-shadow ${focused.boxShadow || "(none)"}).`;
  return { passed: false, code: "NO_RING_AFTER_KEY", note };
}

async function inputMark(context: StepContext): Promise<string> {
  return (await context.driver.attribute(root, "data-input")) ?? "(none)";
}

function named(focused: Focused | undefined): string {
  return focused === undefined ? "the page" : `${focused.tag} "${focused.text}"`;
}
