// @vitest-environment jsdom
import type { MessagingId } from "@halonicjs/ports";
import { NarrowProvider } from "@halonicjs/studio-kit";
import type { ChatOpens } from "@halonicjs/studio-services";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act, StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Messenger } from "../messenger.ts";
import { settle } from "../test-support/page.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { MessengerPage } from "./messenger-page.tsx";

afterEach(unmountAll);

/** Acme with a chat with Chief and one with Liam, each with a message. */
function acmeChats() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const [chief, liam] = ["Chief", "Liam"].map((name) => messaging.addAgent(acme.id, { name }));
  if (chief === undefined || liam === undefined) throw new Error("no agents");
  const chiefChat = messaging.addConversation(chief.id);
  const liamChat = messaging.addConversation(liam.id);
  messaging.addMessage(chiefChat.id, { body: "Merged #12." });
  messaging.addMessage(liamChat.id, { body: "Release notes are ready." });
  return { messaging, chiefChat, liamChat };
}

/** Hand-overs as the shell gives them: `waiting` opened the window; `handOver` sends a later one. */
function handOvers(waiting: MessagingId | undefined) {
  const listeners = new Set<(conversation: MessagingId) => void>();
  const opens: ChatOpens = {
    takePending: async () => waiting,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const handOver = async (conversation: MessagingId) => {
    await act(async () => {
      for (const listener of listeners) listener(conversation);
    });
    await settle();
  };
  return { opens, handOver, listeners };
}

async function openPage(messaging: FakeAgentMessaging, opens: ChatOpens, narrow = false) {
  const page = render(
    <StrictMode>
      <NarrowProvider narrow={narrow}>
        <MessengerPage messenger={new Messenger(messaging)} opens={opens} />
      </NarrowProvider>
    </StrictMode>,
  );
  await settle();
  return page;
}

/** The open chat's name, from its header. */
function openChatName(page: HTMLElement): string | null | undefined {
  return page.querySelector("main header h2")?.textContent;
}

function boxHasFocus(page: HTMLElement): boolean {
  const box = page.querySelector("main textarea");
  return box !== null && document.activeElement === box;
}

verifies("messenger.open-from-quick-ask", () => {
  describe("a chat quick ask hands over", () => {
    it("opens the chat that opened the window, with the focus in its box", async () => {
      const { messaging, liamChat } = acmeChats();
      const { opens } = handOvers(liamChat.id);
      const page = await openPage(messaging, opens);
      expect(openChatName(page)).toBe("Liam");
      expect(page.querySelector("main")?.textContent).toContain("Release notes are ready.");
      expect(boxHasFocus(page)).toBe(true);
    });

    it("opens each later chat it hands over, in place of the open one", async () => {
      const { messaging, chiefChat, liamChat } = acmeChats();
      const { opens, handOver } = handOvers(undefined);
      const page = await openPage(messaging, opens);
      expect(openChatName(page)).toBeUndefined();
      await handOver(chiefChat.id);
      expect(openChatName(page)).toBe("Chief");
      expect(boxHasFocus(page)).toBe(true);
      await handOver(liamChat.id);
      expect(openChatName(page)).toBe("Liam");
      expect(boxHasFocus(page)).toBe(true);
    });

    it("shows the chat in place of the list in a narrow window", async () => {
      const { messaging, chiefChat } = acmeChats();
      const { opens } = handOvers(chiefChat.id);
      const page = await openPage(messaging, opens, true);
      expect(openChatName(page)).toBe("Chief");
      expect(page.querySelector("nav")).toBeNull();
      expect(boxHasFocus(page)).toBe(true);
    });

    it("stops hearing hand-overs once the page closes", async () => {
      const { messaging } = acmeChats();
      const { opens, listeners } = handOvers(undefined);
      await openPage(messaging, opens);
      expect(listeners.size).toBe(1);
      unmountAll();
      expect(listeners.size).toBe(0);
    });
  });
});
