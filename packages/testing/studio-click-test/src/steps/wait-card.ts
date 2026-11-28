import { newRequestText } from "../place-words.ts";
import type { Step, StepContext, StepOutcome } from "../runner.ts";
import {
  buttonNamed,
  clickRow,
  clickWhenShown,
  clickXPathWhenShown,
  foundWithin,
  lastWords,
  waitForText,
  xpathString,
} from "../screen.ts";
import type { Rect } from "../webdriver.ts";
import { screenText } from "../words.ts";
import { closeDialogs, onWorkspaceWithoutSettings, openPlace } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/** How long the demo's run may take, with its test model, to reach its wait step. */
const cardWaitMs = 3 * 60_000;

/** An invented customer's email, as in the demo's own test of Support reply. */
const customerMail = "Hi, my order #1042 arrived damaged. Can I get a refund? — Sam (invented)";

const requestForm = "//form[@data-request-form]";

/** The Inbox's request form: the box the email goes in, and its Send. */
export const requestParts = {
  messageBox: `${requestForm}//textarea`,
  send: `${requestForm}//button[@type='submit']`,
} as const;
const { messageBox, send: sendButton } = requestParts;

/** The wait card is a region named by its title, the step's first line (`inbox.wait-card`). */
const waitCard = `//section[@aria-labelledby=//*[normalize-space()=${xpathString(screenText.waitTitle.text)}]/@id]`;

/** The card's two answers and the row that holds them. */
export const answerParts = {
  first: `${waitCard}${buttonNamed(screenText.waitApprove.text)}`,
  other: `${waitCard}${buttonNamed(screenText.waitReject.text)}`,
  // The nearest box holding both, found by what it holds, not by a class: a row that loses its
  // right alignment then fails as WAIT_ANSWERS_LAYOUT with the boxes, not as a missing element.
  row: `${waitCard}${buttonNamed(screenText.waitApprove.text)}/ancestor::div[.${buttonNamed(screenText.waitReject.text)}][1]`,
} as const;

/**
 * Step 34 (HAL-20621): in a wide window, the demo's Support reply, started from the Inbox's New
 * request with an invented email, waits at its review step, and that card's answers sit in one
 * right-aligned row at their natural width, the first, Approve, at the right end
 * (`inbox.wait-card`). It leaves the step waiting: no later step reads the Inbox.
 */
export const waitCardAnswers: Step = {
  id: "wait-card",
  title: "A wait step's answers sit in one right-aligned row, the first at the right end",
  requirements: ["inbox.wait-card"],
  run: (context) => inWideWindow(context, () => checkAnswerRow(context)),
};

async function checkAnswerRow(context: StepContext): Promise<StepOutcome> {
  const workspace = await onWorkspaceWithoutSettings(context);
  if (!workspace.passed) return workspace;
  await closeDialogs(context);
  const requested = await requestReply(context);
  if (!requested.passed) return requested;
  const card = await openWaitCard(context);
  if (!card.passed) return card;
  const { driver } = context;
  const [row, first, other] = await Promise.all([
    driver.rect(answerParts.row),
    driver.rect(answerParts.first),
    driver.rect(answerParts.other),
  ]);
  const fault = answerRowFault(row, first, other);
  if (fault === undefined) return { passed: true };
  return { passed: false, code: "WAIT_ANSWERS_LAYOUT", note: fault };
}

/** Starts Support reply from the Inbox's request form with the invented email. */
async function requestReply(context: StepContext): Promise<StepOutcome> {
  if (!(await openPlace(context, screenText.inbox.text))) {
    return { passed: false, code: "NO_INBOX", note: "No Inbox in Places." };
  }
  const formShown =
    (await clickWhenShown(context, newRequestText.text, 30_000)) &&
    (await clickXPathWhenShown(context, messageBox, 10_000));
  if (!formShown) {
    const { text } = await waitForText(context, 0, () => undefined);
    return { passed: false, code: "NO_REQUEST_FORM", note: lastWords(text) };
  }
  await context.driver.type(messageBox, customerMail);
  if (!(await clickXPathWhenShown(context, sendButton, 10_000))) {
    return { passed: false, code: "NO_SEND", note: "The request form has no Send." };
  }
  return { passed: true };
}

/** Waits for the run's card, opening it from its row unless the Inbox opened it already. */
async function openWaitCard(context: StepContext): Promise<StepOutcome> {
  const listed = await waitForText(context, cardWaitMs, (text) =>
    text.includes(screenText.waitTitle.text) ? true : undefined,
  );
  if (listed.value !== true) {
    return { passed: false, code: "NO_WAIT_CARD", note: lastWords(listed.text) };
  }
  if (await foundWithin(context, answerParts.first, 10_000)) return { passed: true };
  await clickRow(context, screenText.waitTitle.text, 10_000);
  if (await foundWithin(context, answerParts.first, 20_000)) return { passed: true };
  const { text } = await waitForText(context, 0, () => undefined);
  return { passed: false, code: "NO_WAIT_ANSWERS", note: lastWords(text) };
}

/** How far apart two edges may be, in CSS pixels, and still count as the same. */
const tolerancePx = 1;

/**
 * Why the answers' boxes break `inbox.wait-card`'s desktop row, or undefined when they keep it:
 * one row, the first answer right of the other and ending at the row's right edge, and room left
 * at the row's start, so neither is stretched to fill it.
 */
export function answerRowFault(row: Rect, first: Rect, other: Rect): string | undefined {
  const boxes = `row ${describe(row)}, Approve ${describe(first)}, Reject ${describe(other)}`;
  if (Math.abs(first.y - other.y) > tolerancePx) {
    return `Approve and Reject aren't in one row (${boxes}).`;
  }
  if (first.x < other.x + other.width) {
    return `Approve isn't at the right of Reject (${boxes}).`;
  }
  if (Math.abs(row.x + row.width - (first.x + first.width)) > tolerancePx) {
    return `Approve doesn't end the row at its right edge (${boxes}).`;
  }
  if (other.x <= row.x + tolerancePx) {
    return `The answers fill the row instead of keeping their natural width (${boxes}).`;
  }
  return undefined;
}

function describe({ x, y, width, height }: Rect): string {
  return `${Math.round(width)}×${Math.round(height)} at ${Math.round(x)},${Math.round(y)}`;
}
