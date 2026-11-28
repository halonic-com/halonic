import type { StepContext, StepOutcome } from "../runner.ts";

/** A CSS value with what the app should have drawn for it. */
export interface Expected {
  /** The CSS property to read. */
  readonly property: string;
  /** The value the kit draws, in CSS px so a scaled screen reads the same. */
  readonly value: string;
}

/** What the kit draws for each part of a conversation, as the click steps read it (HAL-20763). */
export const conversationLook = {
  header: [
    { property: "height", value: "64px" },
    { property: "border-bottom-width", value: "0px" },
  ],
  composer: [
    { property: "border-top-left-radius", value: "26px" },
    { property: "min-height", value: "52px" },
  ],
  bubble: [{ property: "border-top-left-radius", value: "7.5px" }],
} as const satisfies Record<string, readonly Expected[]>;

/** The drawn box around the message box at `textarea`: its nearest rounded ancestor. */
export function composerBoxOf(textarea: string): string {
  return `${textarea}/ancestor::div[contains(@class, 'rounded-composer')][1]`;
}

/** The person's bubble holding `text`. */
export function ownBubbleWith(text: string): string {
  return `//*[@data-chat-message='you']/p[contains(normalize-space(), '${text}')]`;
}

/** What a nothing background reads as, so a bubble drawn with no fill shows up. */
const noFill = "rgba(0, 0, 0, 0)";

/**
 * Reads the open chat's header (`kit.content-header`): 64px high with a soft shadow, so no line
 * under it.
 */
export function chatHeaderLook(context: StepContext, header: string): Promise<StepOutcome> {
  return drawnAs(context, "The chat header", header, conversationLook.header);
}

/**
 * Reads the box around a chat's message box (`kit.prompt-look`): 26px corners and at least 52px
 * high. `textarea` is the message box's own XPath. The box is found by its `rounded-composer`
 * class, so a box that lost it fails as a look, not as a missing box.
 */
export async function composerLook(context: StepContext, textarea: string): Promise<StepOutcome> {
  if ((await context.driver.count(textarea)) === 0) {
    return {
      passed: false,
      code: "NO_CONVERSATION_PART",
      note: "The message box isn't on screen.",
    };
  }
  const box = composerBoxOf(textarea);
  if ((await context.driver.count(box)) === 0) {
    return {
      passed: false,
      code: "CONVERSATION_LOOK",
      note: "The message box is on screen, but not in the kit's rounded-composer box.",
    };
  }
  return drawnAs(context, "The message box", box, conversationLook.composer);
}

/**
 * Reads the person's bubble holding `text` (`kit.chat-message`, `kit.chat-message-corner`): filled,
 * not see-through, with 7.5px corners.
 */
export async function ownBubbleLook(context: StepContext, text: string): Promise<StepOutcome> {
  const bubble = ownBubbleWith(text);
  const corners = await drawnAs(context, "Your message's bubble", bubble, conversationLook.bubble);
  if (!corners.passed) return corners;
  const fill = await context.driver.cssValue(bubble, "background-color");
  if (fill !== noFill) return { passed: true };
  return { passed: false, code: "BUBBLE_LOOK", note: "Your message's bubble has no fill." };
}

/** Compares what the app drew at `xpath` with `expected`, naming every value that differs. */
async function drawnAs(
  context: StepContext,
  what: string,
  xpath: string,
  expected: readonly Expected[],
): Promise<StepOutcome> {
  if ((await context.driver.count(xpath)) === 0) {
    return { passed: false, code: "NO_CONVERSATION_PART", note: `${what} isn't on screen.` };
  }
  const wrong: string[] = [];
  for (const { property, value } of expected) {
    const drawn = await context.driver.cssValue(xpath, property);
    if (drawn !== value) wrong.push(`${property} ${drawn}, not ${value}`);
  }
  if (wrong.length === 0) return { passed: true };
  return { passed: false, code: "CONVERSATION_LOOK", note: `${what}: ${wrong.join("; ")}.` };
}
