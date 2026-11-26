// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  byText,
  openChat,
  openMessenger,
  press,
  said,
  settle,
  settleHoldMs,
} from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { isNewLine } from "./transcript.tsx";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const approveOrReject = [
  { id: "approve", label: "Approve" },
  { id: "reject", label: "Reject" },
];

/** Acme's Chief with a chat and an open card for each question, made at 10:00 UTC. */
function chiefAsks(...questions: string[]) {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  messaging.addConversation(chief.id);
  const from = { kind: "agent", agent: chief.id, name: "Chief" } as const;
  const cards = questions.map((question) =>
    messaging.addInboxItem(acme.id, { question, from, options: approveOrReject }),
  );
  return { messaging, cards };
}

const ada = { kind: "person", name: "Ada" } as const;
const approve = { kind: "option", option: "approve" } as const;

/** The final-state lines the page shows, in order. */
function finalLines(page: HTMLElement): (string | null)[] {
  return [...page.querySelectorAll("[data-final-state] [data-final-line]")].map(
    (line) => line.textContent,
  );
}

/** A settle motion that records each element it played on and ends at once. */
function recordedSettle() {
  const played: HTMLElement[] = [];
  const out = (element: HTMLElement) => {
    played.push(element);
    return Promise.resolve();
  };
  return { played, out };
}

/** Lets the fake clock run `ms`, and the page finish what that started. */
async function pass(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await settle();
}

function holdTimers(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
}

verifies("messenger.final-state", () => {
  describe("a card that ends while it shows", () => {
    it("shows its final state when decided elsewhere, then is gone 4 seconds later", async () => {
      const { messaging, cards } = chiefAsks("Merge #12?");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      holdTimers();

      messaging.answerElsewhere(cards[0]?.id ?? "", ada, approve);
      await settle();

      expect(finalLines(page)).toEqual(["Approved by Ada · 10:00"]);
      expect(byText(page, "main ol button", "Approve")).toBeUndefined();
      expect(page.querySelector("[data-cards-bar]")).toBeNull();
      await pass(settleHoldMs - 1);
      expect(finalLines(page)).toHaveLength(1);
      await pass(1);
      expect(finalLines(page)).toEqual([]);
      expect(page.querySelector("main ol")?.textContent).not.toContain("Merge #12?");
    });

    it("looks the same decided here and decided elsewhere", async () => {
      const { messaging, cards } = chiefAsks("Merge #12?", "Tag v1?");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");

      const here = page.querySelector(`[data-chat-card="${cards[0]?.id}"]`);
      await press(here === null ? undefined : byText(here as HTMLElement, "button", "Approve"));
      messaging.answerElsewhere(cards[1]?.id ?? "", { kind: "me" }, approve);
      await settle();

      expect(finalLines(page)).toEqual(["Approved by you · 10:00", "Approved by you · 10:00"]);
    });

    it("says Cancelled or Expired for a card that closed without an answer", async () => {
      const { messaging, cards } = chiefAsks("Merge #12?", "Tag v1?");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");

      messaging.closeElsewhere(cards[0]?.id ?? "", "cancelled");
      messaging.closeElsewhere(cards[1]?.id ?? "", "expired");
      await settle();

      expect(finalLines(page).sort()).toEqual(["Cancelled · 10:00", "Expired · 10:00"]);
    });

    it("stays while the pointer is over it, and goes once 4 seconds passed without it", async () => {
      const { messaging, cards } = chiefAsks("Merge #12?");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      holdTimers();
      messaging.answerElsewhere(cards[0]?.id ?? "", ada, approve);
      await settle();
      const settling = page.querySelector("[data-chat-card-settling]") as HTMLElement;

      await pass(1000);
      settling.dispatchEvent(new Event("pointerenter"));
      await pass(10_000);
      expect(finalLines(page)).toHaveLength(1);
      settling.dispatchEvent(new Event("pointerleave"));
      await pass(settleHoldMs - 1000);

      expect(finalLines(page)).toEqual([]);
    });

    it("changes in place as it ends, with its question muted and nothing played on it", async () => {
      const { played, out } = recordedSettle();
      const { messaging, cards } = chiefAsks("Merge #12?");
      const page = await openMessenger(messaging, [], false, undefined, undefined, undefined, out);
      await openChat(page, "Chief");
      holdTimers();

      messaging.answerElsewhere(cards[0]?.id ?? "", ada, approve);
      await settle();

      expect(finalLines(page)).toEqual(["Approved by Ada · 10:00"]);
      const question = byText(page, "[data-final-state] p", "Merge #12?");
      // The nearest colour wins: the question's own, not one around it.
      const colour = question?.closest("[class*='text-fg']");
      expect(colour?.classList.contains("text-fg-muted")).toBe(true);
      expect(played).toEqual([]);
    });

    it("never counts a settling card as a new line that rises into view", () => {
      const card = chiefAsks("Merge #12?").cards[0];
      if (card === undefined) throw new Error("Acme's card is missing.");
      const line = { kind: "card", key: card.id, card } as const;

      expect(isNewLine(line, false, new Set([card.id]))).toBe(false);
      expect(isNewLine(line, false, new Set())).toBe(true);
    });

    it("keeps the 4-second hold while the person prefers reduced motion, then settles out", async () => {
      // Under reduced motion the kit's settle only fades (`kit.settle`'s own tests).
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
      const { played, out } = recordedSettle();
      const { messaging, cards } = chiefAsks("Merge #12?");
      const page = await openMessenger(messaging, [], false, undefined, undefined, undefined, out);
      await openChat(page, "Chief");
      holdTimers();
      messaging.answerElsewhere(cards[0]?.id ?? "", ada, approve);
      await settle();
      const card = page.querySelector("[data-chat-card-settling]");

      await pass(settleHoldMs - 1);
      expect(played).toEqual([]);
      await pass(1);

      expect(played).toEqual([card]);
      expect(finalLines(page)).toEqual([]);
    });

    it("reads a card decided elsewhere out once, and one answered here only as its answer", async () => {
      const { messaging, cards } = chiefAsks("Merge #12?", "Tag v1?");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");

      messaging.answerElsewhere(cards[0]?.id ?? "", ada, approve);
      await settle();
      expect(said(page)).toBe("Approved by Ada · 10:00");
      expect(page.querySelector("[data-final-state] [role='status']")).toBeNull();

      const here = page.querySelector(`[data-chat-card="${cards[1]?.id}"]`);
      await press(here === null ? undefined : byText(here as HTMLElement, "button", "Approve"));
      expect(said(page)).toBe("Answered: Approve.");
    });

    it("says how an action ended, in a tone that isn't a success's", async () => {
      const { messaging, cards } = chiefAsks("Run the deploy?");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");

      messaging.answerElsewhere(
        cards[0]?.id ?? "",
        { kind: "me" },
        { kind: "action-result", outcome: "declined", steps: [] },
      );
      await settle();

      expect(finalLines(page)).toEqual(["Declined by you · 10:00"]);
      const chip = page.querySelector("[data-final-line] > *");
      expect(chip?.className).not.toContain("success");
    });
  });

  describe("Needs you", () => {
    it("drops the count at once, shows the final state, then says nothing is waiting", async () => {
      const { messaging, cards } = chiefAsks("Merge #12?");
      const page = await openMessenger(messaging);
      await press(page.querySelector("[data-needs-you-entry]"));
      holdTimers();

      messaging.closeElsewhere(cards[0]?.id ?? "", "expired");
      await settle();

      expect(page.querySelector("[data-needs-you-entry]")?.textContent).toBe("Needs you");
      expect(finalLines(page)).toEqual(["Expired · 10:00"]);
      expect(page.querySelector("[data-needs-you-settling]")?.textContent).toContain("Chief");
      await pass(settleHoldMs);
      expect(byText(page, "main p", "Nothing is waiting for you.")).toBeDefined();
    });

    it("moves the focus to the next card's first option once one is answered there", async () => {
      const { messaging, cards } = chiefAsks("Merge #12?", "Tag v1?");
      const page = await openMessenger(messaging);
      await press(page.querySelector("[data-needs-you-entry]"));

      const first = page.querySelector(`[data-needs-you-card="${cards[0]?.id}"]`) as HTMLElement;
      await press(byText(first, "button", "Approve"));

      const next = page.querySelector(`[data-needs-you-card="${cards[1]?.id}"] button`);
      expect(document.activeElement).toBe(next);
      expect(finalLines(page)).toEqual(["Approved by you · 10:00"]);
    });
  });
});
