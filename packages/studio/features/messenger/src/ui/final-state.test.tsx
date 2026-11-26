// @vitest-environment jsdom
import { settleHoldMs } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
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
  return [...page.querySelectorAll("[data-final-state] [role='status']")].map(
    (line) => line.textContent,
  );
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

    it("only fades out while the person prefers reduced motion", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
      const played: Keyframe[][] = [];
      HTMLElement.prototype.animate = function animate(keyframes) {
        played.push(keyframes as Keyframe[]);
        return { finished: Promise.resolve() } as unknown as Animation;
      };
      const { messaging, cards } = chiefAsks("Merge #12?");
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      holdTimers();
      played.length = 0;
      messaging.answerElsewhere(cards[0]?.id ?? "", ada, approve);
      await settle();

      await pass(settleHoldMs);

      expect(finalLines(page)).toEqual([]);
      expect(played.at(-1)).toEqual([{ opacity: 1 }, { opacity: 0 }]);
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
  });
});
