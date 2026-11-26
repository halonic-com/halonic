// @vitest-environment jsdom
import type { AnswerResult, InboxItem } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

const notRecorded = "Couldn't record your decision. Try again.";

/** Acme's Chief with a chat and one open card, made of `card`. */
function chiefAsks(card: Partial<InboxItem>) {
  const messaging = new FakeAgentMessaging({ now: () => new Date(2026, 10, 24, 10, 0) });
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  messaging.addMessage(chat.id, { body: "Morning" });
  messaging.addInboxItem(acme.id, {
    question: "Paint the acme shed?",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    ...card,
  });
  return messaging;
}

/** A card with one question that takes several picks, as a checkbox or suggested-tasks card maps. */
const checkboxCard: Partial<InboxItem> = {
  options: [],
  questions: [
    {
      id: "options",
      prompt: "Which acme files?",
      selection: "multiple",
      required: true,
      options: [
        { id: "draft", label: "acme-draft.md" },
        { id: "notes", label: "acme-notes.txt" },
      ],
    },
  ],
};

const yesNoCard: Partial<InboxItem> = {
  options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
};

function button(page: HTMLElement, label: string): HTMLButtonElement {
  const found = [...page.querySelectorAll<HTMLButtonElement>("main article button")].find(
    (each) => each.textContent === label,
  );
  if (found === undefined) throw new Error(`no button "${label}"`);
  return found;
}

/** The card's own line under its controls. */
function cardLine(page: HTMLElement): string | null | undefined {
  return page.querySelector('main article [role="status"]')?.textContent;
}

/** Ticks acme-draft.md and presses Submit. */
async function submitCheckbox(page: HTMLElement): Promise<void> {
  await press(byText(page, "main fieldset label", "acme-draft.md")?.querySelector("input"));
  await press(button(page, "Submit"));
}

verifies("messenger.card-answer-feedback", () => {
  describe("a card whose answer doesn't land says so", () => {
    it("Submit shows busy while the answer is on its way", async () => {
      const messaging = chiefAsks(checkboxCard);
      let land: (result: AnswerResult) => void = () => {};
      vi.spyOn(messaging, "answer").mockReturnValue(new Promise((resolve) => (land = resolve)));
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");

      await submitCheckbox(page);

      expect(button(page, "Submit").getAttribute("aria-busy")).toBe("true");
      land({ outcome: "refused", reason: "offline" });
    });

    it("a Submit that fails keeps the card open and says to try again", async () => {
      const messaging = chiefAsks(checkboxCard);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const answer = vi
        .spyOn(messaging, "answer")
        .mockRejectedValueOnce(new Error("The agent host refused the request."));
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");

      await submitCheckbox(page);

      expect(answer).toHaveBeenCalledTimes(1);
      expect(cardLine(page)).toBe(notRecorded);
      expect(button(page, "Submit").getAttribute("aria-busy")).not.toBe("true");
      expect(button(page, "Submit").getAttribute("aria-disabled")).not.toBe("true");
    });

    it("an option that fails keeps the card open and says to try again", async () => {
      const messaging = chiefAsks(yesNoCard);
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(messaging, "answer").mockRejectedValueOnce(new Error("engine gone"));
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");

      await press(button(page, "Yes"));

      expect(cardLine(page)).toBe(notRecorded);
      expect(button(page, "Yes").getAttribute("aria-busy")).not.toBe("true");
    });

    it("a Submit the source refuses says why", async () => {
      const messaging = chiefAsks(checkboxCard);
      vi.spyOn(messaging, "answer").mockResolvedValueOnce({
        outcome: "refused",
        reason: "bad-answer",
      });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");

      await submitCheckbox(page);

      expect(cardLine(page)).toBe("This can't be sent here, so nothing was sent.");
    });
  });
});
