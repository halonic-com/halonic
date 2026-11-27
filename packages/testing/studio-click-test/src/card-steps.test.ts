import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  type CardFixture,
  oneQuestionCard,
  planCard,
  promptOn,
  yesNoCard,
} from "./card-fixtures.ts";
import { cardHolding } from "./card-step.ts";
import { button, type FakeStudio, fakeStudio } from "./fake-studio.test-helper.ts";
import { messengerWindowLabel } from "./main-window.ts";
import { cardOneQuestion, cardPlan, cardYesNo, rejectReason } from "./steps/card-kinds.ts";
import { seedNames } from "./test-paperclip.ts";
import { buttonLabels, screenText, words } from "./words.ts";

/** What one button of a copy does on the fake Paperclip: the status and result it leaves. */
type Answers = Record<string, { status: string; result?: unknown; shows?: string }>;

/**
 * A connected Studio whose Inbox lists the Inbox copy of `fixture` and whose Messenger chat shows
 * its Messenger copy; each copy's buttons answer it on the fake Paperclip as `inbox` and
 * `messenger` say. `chatText` is added to the chat, such as the line a card says under it. With
 * `leftOpen`, the Inbox opens on an answered card that hides the list until Back to Inbox.
 */
function cardStudio(
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

function statusOf(studio: FakeStudio, id: string): string | undefined {
  return studio.cards?.get(id)?.status;
}

verifies("studio-click-test.card-steps", () => {
  describe("the yes/no card step", () => {
    const accept = { [buttonLabels.accept.text]: { status: "accepted" } };
    const reject = { [buttonLabels.reject.text]: { status: "rejected" } };

    it("accepts the Inbox copy, rejects the Messenger copy, and checks both on Paperclip", async () => {
      const studio = cardStudio(yesNoCard, accept, reject);
      await expect(cardYesNo.run(studio.context)).resolves.toEqual({ passed: true });
      expect(statusOf(studio, "inbox-yes-no")).toBe("accepted");
      expect(statusOf(studio, "messenger-yes-no")).toBe("rejected");
      expect(studio.shortcuts).toEqual(["Halonic Messenger"]);
    });

    it("goes back to the list when the step before left its answered card open", async () => {
      const studio = cardStudio(yesNoCard, accept, reject, { leftOpen: true });
      await expect(cardYesNo.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.clicks).toContain(screenText.backToInbox.text);
      expect(statusOf(studio, "inbox-yes-no")).toBe("accepted");
    });

    it("fails as NO_ROW with the screen and the shell log when the Inbox never lists the copy", async () => {
      const studio = cardStudio(yesNoCard, accept, reject);
      button(studio, "main", screenText.places.text, () => {
        button(studio, "main", screenText.inbox.text, () => {
          const main = studio.windows.get("main");
          if (main !== undefined) main.text = "Needs you Nothing is waiting for you.";
        });
      });
      await expect(cardYesNo.run(studio.context)).resolves.toMatchObject({
        code: "NO_ROW",
        note: expect.stringMatching(
          /^Inbox: Needs you Nothing is waiting for you\.\nshell\.log:\nengine: crashed/,
        ),
      });
      expect(statusOf(studio, "messenger-yes-no")).toBe("rejected");
    });

    it("answers in Messenger's window, not in an Inbox window that names the agent too", async () => {
      const studio = cardStudio(yesNoCard, accept, reject);
      const text = `${seedNames.agent} asks ${promptOn(yesNoCard, "Messenger")}`;
      studio.windows.set("inbox", { text, buttons: new Map() });
      await expect(cardYesNo.run(studio.context)).resolves.toEqual({ passed: true });
      expect(statusOf(studio, "messenger-yes-no")).toBe("rejected");
    });

    it("fails as NOT_SEEDED when the agent never posted its copy", async () => {
      const studio = cardStudio(yesNoCard, accept, reject);
      studio.cards = undefined;
      await expect(cardYesNo.run(studio.context)).resolves.toMatchObject({
        code: "NOT_SEEDED",
        note: expect.stringContaining("never posted"),
      });
    });

    it("fails as NOT_ANSWERED_ON_PAPERCLIP, naming the Inbox, when Accept never lands", async () => {
      const studio = cardStudio(yesNoCard, { Accept: { status: "pending" } }, reject);
      await expect(cardYesNo.run(studio.context)).resolves.toMatchObject({
        code: "NOT_ANSWERED_ON_PAPERCLIP",
        note: expect.stringMatching(/^Inbox: /),
      });
    });

    it("still answers the Messenger copy when the Inbox fails, and names both failures", async () => {
      const studio = cardStudio(
        yesNoCard,
        { Accept: { status: "pending" } },
        { Reject: { status: "accepted" } },
      );
      const outcome = await cardYesNo.run(studio.context);
      expect(outcome).toMatchObject({
        code: "NOT_ANSWERED_ON_PAPERCLIP",
        note: expect.stringMatching(/^Inbox: .* Messenger: Paperclip has/),
      });
      expect(statusOf(studio, "messenger-yes-no")).toBe("accepted");
    });

    it("fails as WRONG_ANSWER, naming the Messenger, when Paperclip has another answer", async () => {
      const studio = cardStudio(yesNoCard, accept, { Reject: { status: "accepted" } });
      await expect(cardYesNo.run(studio.context)).resolves.toMatchObject({
        code: "WRONG_ANSWER",
        note: expect.stringContaining('Messenger: Paperclip has {"status":"accepted"}'),
      });
    });
  });

  describe("the plan card step", () => {
    const noteLine = words.messengerNeedsNote([buttonLabels.reject.text]);
    const accept = { [buttonLabels.accept.text]: { status: "accepted" } };

    it("writes a reason for Reject in the Inbox and accepts in the chat that leaves Reject out", async () => {
      const inbox = {
        [buttonLabels.reject.text]: {
          status: "rejected",
          result: { reason: rejectReason },
          shows: screenText.rejectReason.text,
        },
      };
      const studio = cardStudio(planCard, inbox, accept, { chatText: noteLine });
      await expect(cardPlan.run(studio.context)).resolves.toEqual({ passed: true });
      expect(studio.typed).toEqual([rejectReason]);
      expect(statusOf(studio, "messenger-plan")).toBe("accepted");
    });

    it("fails as NO_REASON_FIELD when Reject sends without asking for a reason", async () => {
      const inbox = { [buttonLabels.reject.text]: { status: "rejected" } };
      const studio = cardStudio(planCard, inbox, accept, { chatText: noteLine });
      await expect(cardPlan.run(studio.context)).resolves.toMatchObject({
        code: "NO_REASON_FIELD",
      });
      expect(studio.typed).toEqual([]);
    });

    it("fails as NO_NOTE_LINE when the chat card doesn't say Reject is in the Inbox", async () => {
      const inbox = {
        [buttonLabels.reject.text]: {
          status: "rejected",
          result: { reason: rejectReason },
          shows: screenText.rejectReason.text,
        },
      };
      const studio = cardStudio(planCard, inbox, accept);
      await expect(cardPlan.run(studio.context)).resolves.toMatchObject({
        code: "NO_NOTE_LINE",
        note: expect.stringMatching(/^Messenger: /),
      });
    });
  });

  describe("the one-question card step", () => {
    it("checks the option each surface picked is the one Paperclip has", async () => {
      const picked = (option: string) => ({
        status: "answered",
        result: { answers: [{ questionId: "colour", optionIds: [option] }] },
      });
      const studio = cardStudio(
        oneQuestionCard,
        { Green: picked("green") },
        { Blue: picked("blue") },
      );
      await expect(cardOneQuestion.run(studio.context)).resolves.toEqual({ passed: true });
    });
  });

  describe("cardHolding", () => {
    it("scopes the Inbox's open card and a chat's card by the copy's prompt", () => {
      expect(cardHolding("Inbox", "Ship it? (Inbox)")).toBe(
        "//section[contains(string(), 'Ship it? (Inbox)')]",
      );
      expect(cardHolding("Messenger", "It's due")).toBe(
        `//article[contains(string(), "It's due")]`,
      );
    });
  });
});
