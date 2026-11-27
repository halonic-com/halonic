import { type CardFixture, promptOn } from "./card-fixtures.ts";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { messengerWindowLabel } from "./main-window.ts";
import { seedNames } from "./test-paperclip.ts";
import { buttonLabels, screenText } from "./words.ts";

/** What one button of a copy does on the fake Paperclip: the status and result it leaves. */
export type Answers = Record<string, { status: string; result?: unknown; shows?: string }>;

/**
 * A connected Studio whose Inbox lists the Inbox copy of `fixture` and whose Messenger chat shows
 * its Messenger copy; each copy's buttons answer it on the fake Paperclip as `inbox` and
 * `messenger` say. `chatText` is added to the chat, such as the line a card says under it. With
 * `leftOpen`, the Inbox opens on an answered card that hides the list until Back to Inbox.
 */
export function cardStudio(
  fixture: CardFixture,
  inbox: Answers,
  messenger: Answers,
  { chatText = "", leftOpen = false } = {},
) {
  const studio = fakeStudio("Acme");
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
