// @vitest-environment jsdom

import type { InboxItem, InboxQuestion } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentItemCard } from "./agent-item-card.tsx";

afterEach(unmountAll);

const asked = new Date(2026, 10, 24, 10, 0);
const answeredAt = new Date(2026, 10, 24, 18, 43);

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
    required: false,
    options: [
      { id: "now", label: "Now" },
      { id: "later", label: "Next week" },
    ],
  },
];

/** The card "Three open decisions" from "Paperclip · Acme", open unless `state` says otherwise. */
async function decisionsCard(state?: InboxItem["state"]) {
  const clock = { now: asked };
  const messaging = new FakeAgentMessaging({ now: () => clock.now });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const item = messaging.addInboxItem(source.id, {
    question: "Three open decisions",
    options: [],
    questions: decisions,
    ...(state === undefined ? {} : { state }),
  });
  const [read] = await messaging.listSources();
  const answer = vi.fn((given: Parameters<typeof messaging.answer>[1]) =>
    messaging.answer(item.id, given),
  );
  const root = render(
    <AgentItemCard
      item={item}
      source={read}
      now={() => clock.now}
      answer={answer}
      readAttachment={(attachment) => messaging.readAttachment(attachment)}
    />,
  );
  return { root, answer, clock };
}

function option(root: HTMLElement, label: string): HTMLInputElement {
  const found = [...root.querySelectorAll("fieldset label")].find(
    (each) => each.textContent === label,
  );
  const input = found?.querySelector("input");
  if (input == null) throw new Error(`no option "${label}"`);
  return input;
}

function submit(root: HTMLElement): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((each) => each.textContent === "Submit");
}

async function press(element: HTMLElement | undefined) {
  if (element === undefined) throw new Error("nothing to press");
  await act(async () => element.click());
}

verifies("inbox.question-cards", () => {
  describe("an agent's card that asks several questions", () => {
    it("ticks options on an open 3-question card and submits every answer in one body", async () => {
      const { root, answer, clock } = await decisionsCard();
      expect(root.textContent).not.toContain("Your answer");
      expect(option(root, "Compact").type).toBe("checkbox");
      expect(submit(root)?.getAttribute("aria-disabled")).toBe("true");

      await press(option(root, "In the monorepo"));
      await press(option(root, "Compact"));
      await press(option(root, "Wide"));
      clock.now = answeredAt;
      await press(submit(root));

      expect(answer).toHaveBeenCalledTimes(1);
      expect(answer).toHaveBeenCalledWith({
        kind: "answers",
        answers: [
          { question: "repo", options: ["mono"] },
          { question: "look", options: ["compact", "wide"] },
        ],
      });
      expect(root.textContent).toContain("Answered at 18:43: In the monorepo, Compact, Wide.");
      // The callout is the Inbox's answered line (render 5f), so the form doesn't say it again.
      expect(root.textContent).not.toContain("Answered 24 Nov");
      expect(option(root, "Wide").getAttribute("aria-disabled")).toBe("true");
    });

    it("shows an answered card as ticked, disabled boxes with Answered 24 Nov", async () => {
      const { root } = await decisionsCard({
        kind: "answered",
        by: { kind: "person", name: "Liam" },
        answeredAt: answeredAt.toISOString(),
        answer: {
          kind: "answers",
          answers: [
            { question: "repo", options: ["separate"] },
            { question: "look", options: ["dark", "compact"] },
          ],
        },
      });
      for (const label of ["Separate repo", "Dark", "Compact"]) {
        expect(option(root, label).checked).toBe(true);
      }
      for (const label of ["In the monorepo", "Wide", "Now", "Next week"]) {
        expect(option(root, label).checked).toBe(false);
      }
      expect(option(root, "Separate repo").disabled).toBe(true);
      expect(option(root, "Dark").getAttribute("aria-disabled")).toBe("true");
      expect(submit(root)).toBeUndefined();
      expect(root.textContent).not.toContain("Answered 24 Nov");
      // The final state, as the row says it; the ticks say how (`inbox.final-state-open`).
      const callout = [...root.querySelectorAll("p[id]")].find(
        (each) => each.textContent === "Answered by Liam · 18:43",
      );
      expect(callout).toBeDefined();
      expect(option(root, "Dark").getAttribute("aria-describedby")).toContain(callout?.id);
    });
  });
});
