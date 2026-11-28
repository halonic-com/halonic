import type { AnswerClicks } from "../card-step.ts";
import type { StepContext, StepOutcome } from "../runner.ts";
import { foundWithin, xpathString } from "../screen.ts";
import type { Rect } from "../webdriver.ts";

/** How long a card's option gets to show once the card's prompt does. */
const optionWaitMs = 10_000;

/** How far the box's middle may be from the first line's middle, in CSS pixels. */
const tolerancePx = 0.5;

/** A Checkbox with `words` inside `card`, as XPaths: its label, which holds the words, and its box. */
export function checkboxWordsParts(
  card: string,
  words: string,
): { readonly label: string; readonly box: string } {
  const label = `${card}//label[normalize-space()=${xpathString(words)}]`;
  return { label, box: `${label}//input[@type='checkbox']` };
}

/** What the step reads of a Checkbox with words, in CSS pixels. */
export interface CheckboxWordsRead {
  /** Where the app drew the label: the box and its words, with the label's own padding. */
  readonly label: Rect;
  /** Where it drew the 16px box. */
  readonly box: Rect;
  /** The height of one line of the label's words. */
  readonly lineHeight: number;
  /** The label's padding above its words: 0 on a desktop, 12px on a phone or a touch screen. */
  readonly paddingTop: number;
  readonly paddingBottom: number;
}

/** Why a reading can't be judged or breaks `kit.checkbox-words`, with the code the step fails as. */
export interface CheckboxWordsFault {
  readonly code: "CHECKBOX_WORDS_UNREAD" | "CHECKBOX_WORDS_ONE_LINE" | "CHECKBOX_WORDS_LAYOUT";
  readonly note: string;
}

/**
 * Why a Checkbox's box isn't beside the first line of its wrapped words (`kit.checkbox-words`), or
 * undefined when it is. The first line's middle is half a line under the label's padding; a box
 * centred against the words (`items-center`) sits at the middle of all their lines instead, a
 * whole line lower from two lines on. Words on one line can't tell the two apart, so they fail
 * too, as their own code.
 */
export function checkboxWordsFault(read: CheckboxWordsRead): CheckboxWordsFault | undefined {
  const { label, box, lineHeight, paddingTop, paddingBottom } = read;
  if (!(lineHeight > 0 && paddingTop >= 0 && paddingBottom >= 0)) {
    const note = `The label's line height and padding read ${lineHeight}, ${paddingTop} and ${paddingBottom}px.`;
    return { code: "CHECKBOX_WORDS_UNREAD", note };
  }
  const wordsHeight = label.height - paddingTop - paddingBottom;
  const lines = wordsHeight / lineHeight;
  if (lines < 2) {
    const note = `The words don't wrap: they are ${round(wordsHeight)}px high, under two lines of ${lineHeight}px, in a label ${round(label.width)}px wide. The box's place proves nothing then.`;
    return { code: "CHECKBOX_WORDS_ONE_LINE", note };
  }
  const boxMiddle = box.y + box.height / 2 - label.y;
  const firstLineMiddle = paddingTop + lineHeight / 2;
  if (Math.abs(boxMiddle - firstLineMiddle) <= tolerancePx) return undefined;
  const note = `The box's middle is ${round(boxMiddle)}px under the label's top, not ${round(firstLineMiddle)}px, the middle of the first of its ${round(lines)} lines of ${lineHeight}px (the label is ${round(label.height)}px high).`;
  return { code: "CHECKBOX_WORDS_LAYOUT", note };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A length the app computed, such as `20px`, as a number; `normal` or nothing gives NaN. */
function pixels(value: string): number {
  return value.endsWith("px") ? Number.parseFloat(value) : Number.NaN;
}

/**
 * Reads where the app drew the Checkbox with `words` in `card` and checks its box is beside the
 * first line of those words. A Checkbox that doesn't show within 10 seconds fails as `NO_OPTION`.
 */
export async function checkboxWordsLook(
  context: StepContext,
  card: string,
  words: string,
): Promise<StepOutcome> {
  const parts = checkboxWordsParts(card, words);
  // Reading a missing element throws, so the box is waited for first.
  if (!(await foundWithin(context, parts.box, optionWaitMs))) {
    return { passed: false, code: "NO_OPTION", note: `No checkbox with the words "${words}".` };
  }
  const { driver } = context;
  const [label, box, lineHeight, paddingTop, paddingBottom] = await Promise.all([
    driver.rect(parts.label),
    driver.rect(parts.box),
    driver.cssValue(parts.label, "line-height"),
    driver.cssValue(parts.label, "padding-top"),
    driver.cssValue(parts.label, "padding-bottom"),
  ]);
  const fault = checkboxWordsFault({
    label,
    box,
    lineHeight: pixels(lineHeight),
    paddingTop: pixels(paddingTop),
    paddingBottom: pixels(paddingBottom),
  });
  return fault === undefined ? { passed: true } : { passed: false, ...fault };
}

/**
 * A card's clicks with a look at one of its Checkboxes first: the box of the option `words` must
 * sit beside the first line of those words. The clicks happen whatever the look says, because a
 * card left open would be expired by the next step's seed; a look that failed then fails the
 * surface unless a click already did.
 */
export function lookingAtCheckboxWords(words: string, clicks: AnswerClicks): AnswerClicks {
  return async (context, card) => {
    const look = await checkboxWordsLook(context, card, words);
    const clicked = await clicks(context, card);
    return clicked.passed ? look : clicked;
  };
}
