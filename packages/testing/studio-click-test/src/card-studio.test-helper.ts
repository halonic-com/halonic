import {
  type CardFixture,
  checkboxCard,
  promptOn,
  type Surface,
  surfaces,
  wrappingOption,
} from "./card-fixtures.ts";
import { cardHolding } from "./card-step.ts";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { messengerWindowLabel } from "./main-window.ts";
import { checkboxWordsParts } from "./steps/checkbox-words.ts";
import { seedNames } from "./test-paperclip.ts";
import { buttonLabels, screenText } from "./words.ts";

/** What one button of a copy does on the fake Paperclip: the status and result it leaves. */
export type Answers = Record<string, { status: string; result?: unknown; shows?: string }>;

/** How the fake draws the checkbox card's wrapping option; a desktop's, on its first line, by default. */
export interface DrawnCheckbox {
  /** The label's height: two 20px lines by default. */
  readonly labelHeight?: number;
  /** How far the 16px box's top is under the label's top: 2px by default, as the kit sets it. */
  readonly boxTop?: number;
  /** Whether the option is there at all. */
  readonly shown?: boolean;
}

/**
 * Draws the checkbox card's wrapping option on `surface`: a 600px label at the kit's 20px lines
 * without padding, and its box. The steps read it before they tick anything.
 */
export function drawWrappingOption(
  studio: FakeStudio,
  surface: Surface,
  { labelHeight = 40, boxTop = 2, shown = true }: DrawnCheckbox = {},
): void {
  const card = cardHolding(surface, promptOn(checkboxCard, surface));
  const { label, box } = checkboxWordsParts(card, wrappingOption);
  studio.elements.set(box, shown ? 1 : 0);
  studio.rects.set(label, { x: 100, y: 300, width: 600, height: labelHeight });
  studio.rects.set(box, { x: 100, y: 300 + boxTop, width: 16, height: 16 });
  studio.styles.set(`${label} line-height`, "20px");
  studio.styles.set(`${label} padding-top`, "0px");
  studio.styles.set(`${label} padding-bottom`, "0px");
}

/**
 * A connected Studio whose Inbox lists the Inbox copy of `fixture` and whose Messenger chat shows
 * its Messenger copy; each copy's buttons answer it on the fake Paperclip as `inbox` and
 * `messenger` say. `chatText` is added to the chat, such as the line a card says under it. With
 * `leftOpen`, the Inbox opens on an answered card that hides the list until Back to Inbox. The
 * checkbox card's wrapping option is drawn as the kit draws it; `drawWrappingOption` redraws it.
 */
export function cardStudio(
  fixture: CardFixture,
  inbox: Answers,
  messenger: Answers,
  { chatText = "", leftOpen = false } = {},
) {
  const studio = fakeStudio("Acme");
  if (fixture === checkboxCard) for (const surface of surfaces) drawWrappingOption(studio, surface);
  const inboxPrompt = promptOn(fixture, "Inbox");
  const main = () => studio.windows.get("main") ?? { text: "", buttons: new Map() };
  const answer = (copy: string, window: () => { text: string }, answers: Answers) => {
    for (const [label, { status, result = {}, shows = "" }] of Object.entries(answers)) {
      button(studio, copy === "inbox" ? "main" : messengerWindowLabel, label, () => {
        studio.cards?.set(`${copy}-${fixture.key}`, { status, result });
        window().text += ` ${shows}`;
      });
    }
  };
  const showList = () => {
    main().text = `Needs you ${inboxPrompt}`;
    button(studio, "main", inboxPrompt, () => {
      main().text = `${inboxPrompt} ${buttonLabels.accept.text}`;
      answer("inbox", main, inbox);
    });
  };
  button(studio, "main", screenText.places.text, () => {
    button(studio, "main", screenText.inbox.text, () => {
      if (!leftOpen) return showList();
      main().text = "Acme: the plan card Answered at 13:50: Reject.";
      button(studio, "main", screenText.backToInbox.text, showList);
    });
  });
  Object.assign(studio.context, {
    openShortcut: async (name: string) => {
      studio.shortcuts.push(name);
      const text = `${seedNames.agent} ${promptOn(fixture, "Messenger")} ${chatText}`;
      const chat = { text, buttons: new Map<string, () => void>() };
      // The fake names a window by its label, and the shortcut opens Messenger's.
      studio.windows.set(messengerWindowLabel, chat);
      button(studio, messengerWindowLabel, seedNames.agent);
      answer("messenger", () => chat, messenger);
    },
  });
  return studio;
}

/** The status the fake Paperclip has for the copy `id`, such as `inbox-yes-no`. */
export function statusOf(studio: FakeStudio, id: string): string | undefined {
  return studio.cards?.get(id)?.status;
}
