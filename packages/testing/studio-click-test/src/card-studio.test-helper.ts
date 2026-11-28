import { promptOn, type SeedFixture } from "./card-fixtures.ts";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { messengerWindowLabel } from "./main-window.ts";
import { rowsContaining } from "./screen.ts";
import { seedNames } from "./test-paperclip.ts";
import { buttonLabels, screenText } from "./words.ts";

/** What one button of a copy does on the fake Paperclip: the status and result it leaves. */
export type Answers = Record<string, { status: string; result?: unknown; shows?: string }>;

/**
 * A connected Studio whose Inbox lists the Inbox copy of `fixture` and whose Messenger chat shows
 * its Messenger copy; each copy's buttons answer it on the fake Paperclip as `inbox` and
 * `messenger` say. `chatText` is added to the chat, such as the line a card says under it. With
 * `leftOpen`, the Inbox opens on an answered card that hides the list until Back to Inbox. An
 * approval's row says its type, and with `otherRowFirst` the row tried first opens another title.
 */
export function cardStudio(
  fixture: SeedFixture,
  inbox: Answers,
  messenger: Answers,
  { chatText = "", leftOpen = false, otherRowFirst = false } = {},
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
  const row = rowOf(fixture);
  let otherFirst = otherRowFirst;
  const showList = () => {
    main().text = `Needs you ${fixture.record === "decision" ? `2 cards from ${row}` : row}`;
    if (fixture.record === "approval") studio.elements.set(rowsContaining(row), 2);
    if (fixture.record === "decision") studio.elements.set(rowsContaining(row), 1);
    button(studio, "main", row, () => {
      if (otherFirst) {
        otherFirst = false;
        main().text = `${row} Another title`;
        button(studio, "main", screenText.backToInbox.text, showList);
        return;
      }
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

/**
 * What the Inbox copy's row holds, as the app shows it: an approval's type; for a decision the
 * agent's name, as the Inbox bundles both copies into "2 cards from Acme Clicky" (run
 * 46154356446); else the prompt.
 */
function rowOf(fixture: SeedFixture): string {
  if (fixture.record === "approval") return fixture.inboxRow;
  if (fixture.record === "decision") return seedNames.agent;
  return promptOn(fixture, "Inbox");
}

/** The status the fake Paperclip has for the copy `id`, such as `inbox-yes-no`. */
export function statusOf(studio: FakeStudio, id: string): string | undefined {
  return studio.cards?.get(id)?.status;
}
