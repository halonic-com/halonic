// @vitest-environment jsdom
import type { InboxItem, InboxQuestion } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press, said } from "../test-support/page.tsx";
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

/** Acme's Chief with a chat and one card asking `decisions`, open unless `state` says otherwise. */
function chiefAsks(state?: InboxItem["state"]) {
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
    questions: decisions,
    ...(state === undefined ? {} : { state }),
  });
  return { messaging, clock, card };
}

function option(page: HTMLElement, label: string): HTMLInputElement {
  const input = byText(page, "main fieldset label", label)?.querySelector("input");
  if (input == null) throw new Error(`no option "${label}"`);
  return input;
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
      expect(page.querySelector("main [data-chat-card-record]")?.textContent).toContain(
        "Answered 24 Nov",
      );
    });

    it("shows an answered card as ticked, disabled boxes with Answered 24 Nov", async () => {
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
      const record = page.querySelector("main [data-chat-card-record]");
      expect(record?.textContent).toContain("Three open decisions");
      expect(record?.textContent).toContain("Answered 24 Nov");
      for (const label of ["Separate repo", "Dark", "Compact", "Now"]) {
        expect(option(page, label).checked).toBe(true);
      }
      for (const label of ["In the monorepo", "Wide", "Next week"]) {
        expect(option(page, label).checked).toBe(false);
      }
      expect(option(page, "Separate repo").disabled).toBe(true);
      expect(option(page, "Wide").getAttribute("aria-disabled")).toBe("true");
      expect(submit(page)).toBeUndefined();
      expect(page.querySelector("[data-cards-bar]")).toBeNull();
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
