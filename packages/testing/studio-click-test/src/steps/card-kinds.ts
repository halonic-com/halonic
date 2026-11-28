import {
  checkboxCard,
  oneQuestionCard,
  planCard,
  suggestedTasksCard,
  verdictsCard,
  wrappingOption,
  yesNoCard,
} from "../card-fixtures.ts";
import { type AnswerClicks, answeredAs, cardStep } from "../card-step.ts";
import type { StepContext, StepOutcome } from "../runner.ts";
import {
  buttonNamed,
  clickXPathOrWhyNot,
  clickXPathWhenShown,
  lastWords,
  radioNamed,
  xpathString,
} from "../screen.ts";
import { buttonLabels, screenText, words } from "../words.ts";
import { lookingAtCheckboxWords } from "./checkbox-words.ts";

/** The reason the plan card's Reject is sent with, which Paperclip must keep. */
export const rejectReason = "Click test: the Acme plan needs a date.";

/** Clicks the button named `label` in the card, or fails as `NO_BUTTON`. */
function press(label: string): AnswerClicks {
  return async (context, card) => {
    const whyNot = await clickXPathOrWhyNot(context, `${card}${buttonNamed(label)}`, 10_000);
    if (whyNot === undefined) return { passed: true };
    // The page text alone can't tell a missing button from one the click can't reach (HAL-21192).
    const text = await context.driver.pageText().catch(() => "");
    return { passed: false, code: "NO_BUTTON", note: `No ${label}: ${whyNot} ${lastWords(text)}` };
  };
}

/** An XPath, inside a card, for the checkbox with `label` as its words. */
export function checkboxNamed(label: string): string {
  return `//label[normalize-space()=${xpathString(label)}]//input[@type='checkbox']`;
}

/** An XPath, inside a card, for the radio `label` of the question (or verdict item) `question`. */
export function answerRadio(question: string, label: string): string {
  return `//fieldset[@data-question=${xpathString(question)}]${radioNamed(label)}`;
}

/**
 * Clicks each control `controls` finds inside the card, then Submit, which sends them all in
 * one answer. A control that never shows fails as `NO_OPTION`.
 */
function pickThenSubmit(controls: readonly string[]): AnswerClicks {
  return async (context, card) => {
    for (const control of controls) {
      if (!(await clickXPathWhenShown(context, `${card}${control}`, 10_000))) {
        const text = await context.driver.pageText().catch(() => "");
        return { passed: false, code: "NO_OPTION", note: `No ${control}. ${lastWords(text)}` };
      }
    }
    return press(buttonLabels.submit.text)(context, card);
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

const listCardRequirements = [
  "inbox.agent-inbox-items",
  "messenger.question-cards",
  "paperclip-client.card-kinds",
];

/**
 * A checkbox confirmation: two picks in the Inbox, one in the Messenger, each sent with Submit.
 * Before the picks, each surface's box of the option whose words wrap must sit beside their first
 * line (`kit.checkbox-words`).
 */
export const cardCheckbox = cardStep({
  id: "card-checkbox",
  title: "Cards: a checkbox confirmation is answered with its picks in the Inbox and the Messenger",
  requirements: [...listCardRequirements, "kit.checkbox-words"],
  fixture: checkboxCard,
  clicks: {
    Inbox: lookingAtCheckboxWords(
      wrappingOption,
      pickThenSubmit([checkboxNamed("Email"), checkboxNamed("Blog")]),
    ),
    Messenger: lookingAtCheckboxWords(wrappingOption, pickThenSubmit([checkboxNamed("Social")])),
  },
  answered: {
    Inbox: answeredAs("accepted", { selectedOptionIds: ["email", "blog"] }),
    Messenger: answeredAs("accepted", { selectedOptionIds: ["social"] }),
  },
});

/** Item verdicts: a verdict per item, the other way round on each surface, sent with Submit. */
export const cardVerdicts = cardStep({
  id: "card-verdicts",
  title: "Cards: item verdicts are given per item in the Inbox and the Messenger",
  requirements: [...listCardRequirements, "inbox.card-bar-reach"],
  fixture: verdictsCard,
  clicks: {
    Inbox: pickThenSubmit([answerRadio("teaser", "Approve"), answerRadio("recap", "Defer")]),
    Messenger: pickThenSubmit([answerRadio("teaser", "Defer"), answerRadio("recap", "Approve")]),
  },
  answered: {
    Inbox: answeredAs("answered", {
      items: [
        { id: "teaser", verdict: "approve" },
        { id: "recap", verdict: "defer" },
      ],
    }),
    Messenger: answeredAs("answered", {
      items: [
        { id: "teaser", verdict: "defer" },
        { id: "recap", verdict: "approve" },
      ],
    }),
  },
});

/** Suggested tasks: one draft accepted on each surface, so Paperclip makes it and skips the other. */
export const cardSuggestedTasks = cardStep({
  id: "card-suggested-tasks",
  title: "Cards: suggested tasks are picked and made in the Inbox and the Messenger",
  requirements: listCardRequirements,
  fixture: suggestedTasksCard,
  clicks: {
    Inbox: pickThenSubmit([checkboxNamed("Acme: write the press note")]),
    Messenger: pickThenSubmit([checkboxNamed("Acme: send the launch survey")]),
  },
  answered: {
    Inbox: answeredAs("accepted", {
      createdTasks: [{ clientKey: "press" }],
      skippedClientKeys: ["survey"],
    }),
    Messenger: answeredAs("accepted", {
      createdTasks: [{ clientKey: "survey" }],
      skippedClientKeys: ["press"],
    }),
  },
});
