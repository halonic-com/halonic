import { oneQuestionCard, planCard, yesNoCard } from "../card-fixtures.ts";
import { type AnswerClicks, answeredAs, cardStep } from "../card-step.ts";
import type { StepContext, StepOutcome } from "../runner.ts";
import { buttonNamed, clickXPathWhenShown, lastWords } from "../screen.ts";
import { buttonLabels, screenText, words } from "../words.ts";

/** The reason the plan card's Reject is sent with, which Paperclip must keep. */
export const rejectReason = "Click test: the Acme plan needs a date.";

/** Clicks the button named `label` in the card, or fails as `NO_BUTTON`. */
function press(label: string): AnswerClicks {
  return async (context, card) => {
    if (await clickXPathWhenShown(context, `${card}${buttonNamed(label)}`, 10_000)) {
      return { passed: true };
    }
    const text = await context.driver.pageText().catch(() => "");
    return { passed: false, code: "NO_BUTTON", note: `No ${label}. ${lastWords(text)}` };
  };
}

/**
 * Reject on a card that needs a reason: it must open the reason field rather than send, and the
 * field's own Reject sends what was written (`inbox.option-note`).
 */
async function rejectWithReason(context: StepContext, card: string): Promise<StepOutcome> {
  const opened = await press(buttonLabels.reject.text)(context, card);
  if (!opened.passed) return opened;
  const text = await context.driver.pageText();
  if (!text.includes(screenText.rejectReason.text)) {
    return { passed: false, code: "NO_REASON_FIELD", note: lastWords(text) };
  }
  await context.driver.type(`${card}//textarea`, rejectReason);
  return press(buttonLabels.reject.text)(context, card);
}

/**
 * In a chat, Reject needs a note the chat has no field for: the card leaves it out and says to
 * choose it in the Inbox (`messenger.option-note`), and Accept answers it.
 */
async function acceptWithoutReject(context: StepContext, card: string): Promise<StepOutcome> {
  const text = await context.driver.pageText();
  const line = words.messengerNeedsNote([buttonLabels.reject.text]);
  if (!text.includes(line)) return { passed: false, code: "NO_NOTE_LINE", note: lastWords(text) };
  if ((await context.driver.count(`${card}${buttonNamed(buttonLabels.reject.text)}`)) > 0) {
    return {
      passed: false,
      code: "REJECT_IN_CHAT",
      note: "The chat offers Reject without a note.",
    };
  }
  return press(buttonLabels.accept.text)(context, card);
}

/** A plain yes/no card: Accept in the Inbox, Reject in the Messenger. */
export const cardYesNo = cardStep({
  id: "card-yes-no",
  title: "Cards: a yes/no card is answered in the Inbox and in the Messenger",
  requirements: ["inbox.agent-inbox-items", "messenger.inline-cards"],
  fixture: yesNoCard,
  clicks: { Inbox: press(buttonLabels.accept.text), Messenger: press(buttonLabels.reject.text) },
  answered: { Inbox: answeredAs("accepted"), Messenger: answeredAs("rejected") },
});

/** A plan approval bound to a document revision: Reject with a reason, then Accept in a chat. */
export const cardPlan = cardStep({
  id: "card-plan",
  title: "Cards: a plan approval's Reject asks for a reason, and a chat leaves it to the Inbox",
  requirements: ["inbox.option-note", "messenger.option-note"],
  fixture: planCard,
  clicks: { Inbox: rejectWithReason, Messenger: acceptWithoutReject },
  answered: {
    Inbox: answeredAs("rejected", { reason: rejectReason }),
    Messenger: answeredAs("accepted"),
  },
});

/** A card with one single-select question: one button per option on both surfaces. */
export const cardOneQuestion = cardStep({
  id: "card-one-question",
  title: "Cards: a one-question card is answered with an option in the Inbox and the Messenger",
  requirements: [
    "inbox.agent-inbox-items",
    "messenger.inline-cards",
    "paperclip-client.question-cards",
  ],
  fixture: oneQuestionCard,
  clicks: { Inbox: press("Green"), Messenger: press("Blue") },
  answered: {
    Inbox: answeredAs("answered", { answers: [{ questionId: "colour", optionIds: ["green"] }] }),
    Messenger: answeredAs("answered", { answers: [{ questionId: "colour", optionIds: ["blue"] }] }),
  },
});
