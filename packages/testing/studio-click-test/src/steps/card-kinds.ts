import {
  checkboxCard,
  oneQuestionCard,
  planCard,
  suggestedTasksCard,
  verdictsCard,
  yesNoCard,
} from "../card-fixtures.ts";
import { type AnswerClicks, answeredAs, cardStep } from "../card-step.ts";
import {
  buttonNamed,
  clickXPathWhenShown,
  lastWords,
  radioNamed,
  waitForText,
  xpathString,
} from "../screen.ts";
import { buttonLabels, screenText, words } from "../words.ts";

/** The reason the plan card's Reject is sent with, which Paperclip must keep. */
export const rejectReason = "Click test: the Acme plan needs a date.";

/** Clicks the button named `label` in the card, or fails as `NO_BUTTON`. */
export function press(label: string): AnswerClicks {
  return async (context, card) => {
    if (await clickXPathWhenShown(context, `${card}${buttonNamed(label)}`, 10_000)) {
      return { passed: true };
    }
    const text = await context.driver.pageText().catch(() => "");
    return { passed: false, code: "NO_BUTTON", note: `No ${label}. ${lastWords(text)}` };
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
 * An option that takes a note: pressing it must open its field, labelled `field`, rather than
 * send, or the surface fails as `missing`; the field's own button sends what was written
 * (`inbox.option-note`).
 */
export function pressWithNote(
  label: string,
  note: { readonly field: string; readonly text: string; readonly missing: string },
): AnswerClicks {
  return async (context, card) => {
    const opened = await press(label)(context, card);
    if (!opened.passed) return opened;
    const shown = await waitForText(context, 10_000, (text) =>
      text.includes(note.field) ? true : undefined,
    );
    if (shown.value !== true) {
      return { passed: false, code: note.missing, note: lastWords(shown.text) };
    }
    await context.driver.type(`${card}//textarea`, note.text);
    return press(label)(context, card);
  };
}

/** Reject on a card that needs a reason. */
const rejectWithReason = pressWithNote(buttonLabels.reject.text, {
  field: screenText.rejectReason.text,
  text: rejectReason,
  missing: "NO_REASON_FIELD",
});

/**
 * In a chat, an option that needs a note, `leftOut`, has no field: the card leaves it out and
 * says to choose it in the Inbox (`messenger.option-note`), and `answer` answers the card.
 */
export function pressLeavingNoteToInbox(answer: string, leftOut: string): AnswerClicks {
  return async (context, card) => {
    const text = await context.driver.pageText();
    const line = words.messengerNeedsNote([leftOut]);
    if (!text.includes(line)) return { passed: false, code: "NO_NOTE_LINE", note: lastWords(text) };
    if ((await context.driver.count(`${card}${buttonNamed(leftOut)}`)) > 0) {
      const note = `The chat offers ${leftOut} without a note.`;
      return { passed: false, code: "NOTE_OPTION_IN_CHAT", note };
    }
    return press(answer)(context, card);
  };
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
  clicks: {
    Inbox: rejectWithReason,
    Messenger: pressLeavingNoteToInbox(buttonLabels.accept.text, buttonLabels.reject.text),
  },
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

/** A checkbox confirmation: two picks in the Inbox, one in the Messenger, each sent with Submit. */
export const cardCheckbox = cardStep({
  id: "card-checkbox",
  title: "Cards: a checkbox confirmation is answered with its picks in the Inbox and the Messenger",
  requirements: listCardRequirements,
  fixture: checkboxCard,
  clicks: {
    Inbox: pickThenSubmit([checkboxNamed("Email"), checkboxNamed("Blog")]),
    Messenger: pickThenSubmit([checkboxNamed("Social")]),
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
  requirements: listCardRequirements,
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
