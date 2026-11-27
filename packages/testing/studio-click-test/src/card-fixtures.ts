/** Where a seeded card is answered: the Inbox of the main window, or a chat in Halonic Messenger. */
export type Surface = "Inbox" | "Messenger";

/** Both surfaces, in the order a card step answers them. */
export const surfaces: readonly Surface[] = ["Inbox", "Messenger"];

/**
 * A card kind the click test seeds twice on the throwaway Paperclip (HAL-19002): once by the
 * board on a task of its own, for the Inbox, and once by the seeded agent on its chat, for the
 * Messenger, which shows only the chat agent's own cards.
 */
export interface CardFixture {
  /** A short name, used in the cards' idempotency keys and the Inbox copy's task. */
  readonly key: string;
  readonly kind:
    | "request_confirmation"
    | "ask_user_questions"
    | "request_checkbox_confirmation"
    | "request_item_verdicts"
    | "suggest_tasks";
  /** The card's prompt without its surface; the Inbox titles the card's row with it. */
  readonly prompt: string;
  /** The card's payload for one copy's prompt. */
  readonly payload: (prompt: string) => Readonly<Record<string, unknown>>;
  /** The prompt goes in the card's `title`: a suggested-task card's payload has no prompt. */
  readonly promptAsTitle?: true;
  /** A document the card is bound to, written on the card's task first (a plan approval). */
  readonly document?: { readonly key: string; readonly body: string };
}

/** One copy's prompt, which names its surface, so each copy has a row and a card of its own. */
export function promptOn(fixture: CardFixture, surface: Surface): string {
  return `${fixture.prompt} (${surface})`;
}

/** A plain yes/no card, with Paperclip's own Accept and Reject. */
export const yesNoCard: CardFixture = {
  key: "yes-no",
  kind: "request_confirmation",
  prompt: "Send the Acme newsletter today?",
  payload: (prompt) => ({ version: 1, prompt }),
};

/** A plan approval bound to revision 1 of the task's plan, whose Reject needs a reason. */
export const planCard: CardFixture = {
  key: "plan",
  kind: "request_confirmation",
  prompt: "Approve the Acme launch plan?",
  payload: (prompt) => ({ version: 1, prompt, rejectRequiresReason: true }),
  document: { key: "plan", body: "# Acme launch plan\n\nShip the newsletter on Monday." },
};

/** A question card with one single-select question, which keeps one button per option. */
export const oneQuestionCard: CardFixture = {
  key: "one-question",
  kind: "ask_user_questions",
  prompt: "Which colour for the Acme logo?",
  payload: (prompt) => ({
    version: 1,
    questions: [
      {
        id: "colour",
        prompt,
        selectionMode: "single",
        required: true,
        options: [
          { id: "blue", label: "Blue" },
          { id: "green", label: "Green" },
        ],
      },
    ],
  }),
};

/**
 * A checkbox confirmation that takes one or two of three picks. Paperclip refuses one whose
 * default picks are fewer than `minSelected`; Halonic doesn't tick the defaults, so the
 * steps' own picks are the whole answer.
 */
export const checkboxCard: CardFixture = {
  key: "checkbox",
  kind: "request_checkbox_confirmation",
  prompt: "Where should the Acme launch go out?",
  payload: (prompt) => ({
    version: 1,
    prompt,
    options: [
      { id: "email", label: "Email" },
      { id: "blog", label: "Blog" },
      { id: "social", label: "Social" },
    ],
    defaultSelectedOptionIds: ["email"],
    minSelected: 1,
    maxSelected: 2,
  }),
};

/**
 * An item verdict card with Approve, Reject and Defer per item. Reject needs a reason by
 * Paperclip's default, so the step answers with Approve and Defer.
 */
export const verdictsCard: CardFixture = {
  key: "verdicts",
  kind: "request_item_verdicts",
  prompt: "Review the Acme launch posts",
  payload: (prompt) => ({
    version: 1,
    prompt,
    items: [
      { id: "teaser", label: "Teaser post" },
      { id: "recap", label: "Recap post" },
    ],
    verdicts: ["approve", "reject", "defer"],
  }),
};

/** Suggested tasks: two drafts, and the card's title is its prompt. */
export const suggestedTasksCard: CardFixture = {
  key: "suggested-tasks",
  kind: "suggest_tasks",
  prompt: "Follow-ups for the Acme launch",
  promptAsTitle: true,
  payload: () => ({
    version: 1,
    tasks: [
      { clientKey: "press", title: "Acme: write the press note" },
      { clientKey: "survey", title: "Acme: send the launch survey" },
    ],
  }),
};
