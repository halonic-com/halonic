import { decisionCard, hireCard, strategyCard } from "../card-fixtures.ts";
import { answeredAs, cardStep } from "../card-step.ts";
import { buttonLabels, screenText } from "../words.ts";
import { press, pressLeavingNoteToInbox, pressWithNote } from "./card-kinds.ts";

/** The note the strategy approval's Request changes is sent with, which Paperclip must keep. */
export const changesNote = "Click test: aim for 3,000 readers first.";

const approvalRequirements = [
  "inbox.decisions",
  "messenger.inline-cards",
  "paperclip-client.approval-fields",
];

/**
 * A hire approval: Approve in the Inbox, Reject in a chat, which leaves Request changes and its
 * note to the Inbox.
 */
export const cardHire = cardStep({
  id: "card-hire",
  title: "Cards: a hire approval is approved in the Inbox and rejected in the Messenger",
  requirements: [...approvalRequirements, "messenger.option-note"],
  fixture: hireCard,
  clicks: {
    Inbox: press(buttonLabels.approve.text),
    Messenger: pressLeavingNoteToInbox(buttonLabels.reject.text, buttonLabels.requestChanges.text),
  },
  answered: { Inbox: answeredAs("approved"), Messenger: answeredAs("rejected") },
});

/**
 * A strategy approval: Request changes in the Inbox opens its note field and sends the note, which
 * sends the approval back to the agent; Approve in a chat.
 */
export const cardStrategy = cardStep({
  id: "card-strategy",
  title: "Cards: a strategy approval goes back with a note from the Inbox, and a chat approves it",
  requirements: [...approvalRequirements, "inbox.option-note", "messenger.option-note"],
  fixture: strategyCard,
  clicks: {
    Inbox: pressWithNote(buttonLabels.requestChanges.text, {
      field: screenText.whatShouldChange.text,
      text: changesNote,
      missing: "NO_NOTE_FIELD",
    }),
    Messenger: pressLeavingNoteToInbox(buttonLabels.approve.text, buttonLabels.requestChanges.text),
  },
  answered: {
    Inbox: answeredAs("revision_requested", { decisionNote: changesNote }),
    Messenger: answeredAs("approved"),
  },
});

/** A standalone decision: one button per option, Blue in the Inbox and Green in a chat. */
export const cardDecision = cardStep({
  id: "card-decision",
  title: "Cards: a decision is answered with an option's button in the Inbox and the Messenger",
  requirements: ["inbox.decisions", "messenger.inline-cards", "paperclip-client.decisions"],
  fixture: decisionCard,
  clicks: { Inbox: press("Blue"), Messenger: press("Green") },
  answered: {
    Inbox: answeredAs("decided", { chosenOptionId: "blue" }),
    Messenger: answeredAs("decided", { chosenOptionId: "green" }),
  },
});
