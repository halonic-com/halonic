// @vitest-environment jsdom

import { agentTint } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byText, openMessenger, press, settle, settleHoldMs } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

afterEach(unmountAll);

/**
 * Acme's Chief (CTO), who put "Merge #12?" to the person at 9:00 in his chat, and the channel
 * Engineering, where Elena asked "Which hostname?" at 8:30.
 */
function acme() {
  return acmeWithElena().messaging;
}

/** {@link acme}, with Elena's ID. */
function acmeWithElena() {
  const messaging = new FakeAgentMessaging();
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief", title: "CTO" });
  const elena = messaging.addAgent(source.id, { name: "Elena" });
  messaging.addConversation(chief.id);
  const channel = messaging.addConversation(chief.id, {
    title: "Engineering",
    members: [chief.id, elena.id],
  });
  messaging.addMessage(channel.id, {
    author: { kind: "me" },
    body: "Can you set up the docs preview?",
    to: [elena.id],
    work: [{ agent: elena.id, state: "asks-you", work: "w1", since: "2026-11-26T08:00:00.000Z" }],
  });
  messaging.addInboxItem(source.id, {
    question: "Which hostname?",
    work: "w1",
    createdAt: "2026-11-26T08:30:00.000Z",
    from: { kind: "agent", agent: elena.id, name: "Elena" },
    options: [{ id: "docs", label: "docs.acme.example" }],
  });
  messaging.addInboxItem(source.id, {
    question: "Merge #12?",
    createdAt: "2026-11-26T09:00:00.000Z",
    from: { kind: "agent", agent: chief.id, name: "Chief" },
    options: [{ id: "yes", label: "Yes" }],
  });
  return { messaging, elena: elena.id };
}

function entry(page: HTMLElement): Element | null {
  return page.querySelector("nav [data-needs-you-entry]");
}

function waitingCards(page: HTMLElement): string[] {
  return [...page.querySelectorAll("main [data-needs-you-card]")].map(
    (card) => card.textContent ?? "",
  );
}

verifies("messenger.needs-you", () => {
  describe("Needs you", () => {
    it("is one entry at the top of the list with a violet count of what waits", async () => {
      const page = await openMessenger(acme());
      expect(entry(page)?.textContent).toBe("Needs you2 2 waiting");
      expect(entry(page)?.querySelector(".text-warning")?.textContent).toBe("2 2 waiting");
      // It comes before the chats.
      const first = page.querySelector("nav button[data-needs-you-entry], nav li button");
      expect(first).toBe(entry(page));
    });

    it("lists everything waiting, oldest first, with who asked and where", async () => {
      const page = await openMessenger(acme());
      await press(entry(page));
      expect(entry(page)?.getAttribute("aria-current")).toBe("true");
      expect(page.querySelector("main header")?.textContent).toBe(
        "Needs you2 waiting, oldest first",
      );
      const [elena, chief] = waitingCards(page);
      expect(elena).toContain("Elena · in Engineering");
      expect(elena).toContain("Which hostname?");
      // A chat is named by its agent alone, without the title the list row adds.
      expect(chief).toContain("Chief · in Chief");
      expect(chief).not.toContain("CTO");
      expect(chief).toContain("Merge #12?");
    });

    it("answers a card in place, which then leaves the panel and the count", async () => {
      const page = await openMessenger(acme());
      await press(entry(page));
      await press(byText(page, "main [data-needs-you-card] button", "Yes"));
      expect(waitingCards(page)).toHaveLength(1);
      expect(entry(page)?.textContent).toBe("Needs you1 1 waiting");
    });

    it("says nothing is waiting, with no count, once every card is answered and has settled away", async () => {
      const page = await openMessenger(acme());
      await press(entry(page));
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      try {
        await press(byText(page, "main [data-needs-you-card] button", "Yes"));
        await press(byText(page, "main [data-needs-you-card] button", "docs.acme.example"));
        expect(page.querySelector("main header")?.textContent).toBe("Needs you");
        await act(async () => {
          vi.advanceTimersByTime(settleHoldMs);
        });
        await settle();
        expect(byText(page, "main p", "Nothing is waiting for you.")).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("opens the chat where a card was asked", async () => {
      const page = await openMessenger(acme());
      await press(entry(page));
      await press(byText(page, "main [data-needs-you-card] button", "Open chat"));
      expect(page.querySelector("main header h2")?.textContent).toBe("Engineering");
      expect(entry(page)?.getAttribute("aria-current")).toBeNull();
    });
  });
});

verifies("messenger.agent-avatar-tint", () => {
  it("draws a channel question's asker on their own tint, the channel's members on theirs", async () => {
    const { messaging, elena } = acmeWithElena();
    const page = await openMessenger(messaging);
    await press(entry(page));
    // Elena's question is the oldest, so the first card.
    const card = page.querySelector("main [data-needs-you-card]");
    const tile = card?.querySelector("span.rounded-full");
    expect(tile?.textContent).toBe("E");
    expect(tile?.className).toContain(agentTint(elena));
    // The channel's picture is its members', each on their own tint (`messenger.channel-picture`).
    const channel = byText(page, "nav li button", "Engineering");
    const behind = channel?.querySelector('[data-member="behind"] span.rounded-full');
    expect(behind?.textContent).toBe("E");
    expect(behind?.className).toContain(agentTint(elena));
  });
});
