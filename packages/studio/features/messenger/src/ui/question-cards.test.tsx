// @vitest-environment jsdom
import type { InboxItem, InboxQuestion } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press, said, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/** The board's card of HAL-10: three open decisions, the second one ticked with several looks. */
const decisions: readonly InboxQuestion[] = [
  {
    id: "repo",
    prompt: "Where does ToolScript live?",
    selection: "single",
    required: true,
    options: [
      { id: "separate", label: "Separate repo" },
      { id: "mono", label: "In the monorepo" },
    ],
  },
  {
    id: "look",
    prompt: "Which OpenUI looks?",
    selection: "multiple",
    required: true,
    options: [
      { id: "dark", label: "Dark" },
      { id: "compact", label: "Compact" },
      { id: "wide", label: "Wide" },
    ],
  },
  {
    id: "phase",
    prompt: "Start phase 2?",
    selection: "single",
    required: true,
    options: [
      { id: "now", label: "Now" },
      { id: "later", label: "Next week" },
    ],
  },
];

/** A verdict card's item whose Reject needs a reason, as the Paperclip provider maps it. */
const verdict: readonly InboxQuestion[] = [
  {
    id: "intro",
    prompt: "Intro page",
    selection: "single",
    required: false,
    options: [
      { id: "approve", label: "Approve" },
      {
        id: "reject",
        label: "Reject",
        noteRequired: true,
        noteLabel: "Why are you rejecting this?",
      },
    ],
  },
];

/** Acme's Chief with a chat and one card asking `questions`, open unless `state` says otherwise. */
function chiefAsks(state?: InboxItem["state"], questions: readonly InboxQuestion[] = decisions) {
  const clock = { now: new Date(2026, 10, 24, 10, 0) };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  messaging.addMessage(chat.id, { body: "Morning" });
  const card = messaging.addInboxItem(acme.id, {
    question: "Three open decisions",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    options: [],
    questions,
    ...(state === undefined ? {} : { state }),
  });
  return { messaging, clock, card };
}

function option(page: HTMLElement, label: string): HTMLInputElement {
  const input = byText(page, "main fieldset label", label)?.querySelector("input");
  if (input == null) throw new Error(`no option "${label}"`);
  return input;
}

async function writeNote(page: HTMLElement, text: string): Promise<void> {
  const field = page.querySelector("main form textarea");
  if (!(field instanceof HTMLTextAreaElement)) throw new Error("no note field");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

function submit(page: HTMLElement): HTMLButtonElement | undefined {
  return [...page.querySelectorAll<HTMLButtonElement>("main form button")].find(
    (each) => each.textContent === "Submit",
  );
}

verifies("messenger.question-cards", () => {
  describe("cards that ask several questions", () => {
    it("ticks options on an open 3-question card and submits every answer in one body", async () => {
      const { messaging, clock, card } = chiefAsks();
      const answer = vi.spyOn(messaging, "answer");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      const legends = [...page.querySelectorAll("main fieldset > legend")];
      expect(legends.map((each) => each.textContent)).toEqual([
        "Where does ToolScript live?",
        "Which OpenUI looks?",
        "Start phase 2?",
      ]);
      expect(option(page, "Dark").type).toBe("checkbox");
      expect(option(page, "Now").type).toBe("radio");
      expect(submit(page)?.getAttribute("aria-disabled")).toBe("true");

      await press(option(page, "Separate repo"));
      await press(option(page, "Wide"));
      await press(option(page, "Dark"));
      expect(submit(page)?.getAttribute("aria-disabled")).toBe("true");
      await press(option(page, "Next week"));
      clock.now = new Date(2026, 10, 24, 18, 43);
      await press(submit(page));

      expect(answer).toHaveBeenCalledTimes(1);
      expect(answer).toHaveBeenCalledWith(card.id, {
        kind: "answers",
        answers: [
          { question: "repo", options: ["separate"] },
          { question: "look", options: ["dark", "wide"] },
          { question: "phase", options: ["later"] },
        ],
      });
      expect(said(page)).toBe("Answered: Separate repo, Dark, Wide, Next week.");
      expect(page.querySelector("[data-cards-bar]")).toBeNull();
      expect(page.querySelector("main [data-chat-card-settling]")?.textContent).toContain(
        "Answered by you · 18:43",
      );
    });

    it("doesn't show a card that was answered before the chat opened", async () => {
      const { messaging } = chiefAsks({
        kind: "answered",
        by: { kind: "me" },
        answeredAt: new Date(2026, 10, 24, 18, 43).toISOString(),
        answer: {
          kind: "answers",
          answers: [
            { question: "repo", options: ["separate"] },
            { question: "look", options: ["dark", "compact"] },
            { question: "phase", options: ["now"] },
          ],
        },
      });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      // Its task in Paperclip keeps it (`messenger.final-state`).
      expect(page.querySelector("main ol")?.textContent).not.toContain("Three open decisions");
      expect(page.querySelector("main fieldset")).toBeNull();
      expect(page.querySelector("[data-cards-bar]")).toBeNull();
    });

    it("asks for the reason a Reject needs, and sends it with that item's verdict", async () => {
      const { messaging, card } = chiefAsks(undefined, verdict);
      const answer = vi.spyOn(messaging, "answer");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await press(option(page, "Reject"));
      expect(page.querySelector("main form")?.textContent).toContain("Why are you rejecting this?");
      expect(submit(page)?.getAttribute("aria-disabled")).toBe("true");

      await writeNote(page, "Add the install step");
      await press(submit(page));
      expect(answer).toHaveBeenCalledWith(card.id, {
        kind: "answers",
        answers: [{ question: "intro", options: ["reject"], text: "Add the install step" }],
      });
    });

    it("pressing the bar focuses the open card's first option", async () => {
      const { messaging } = chiefAsks();
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await press(page.querySelector("[data-cards-bar] button"));
      expect(document.activeElement).toBe(option(page, "Separate repo"));
    });
  });
});
