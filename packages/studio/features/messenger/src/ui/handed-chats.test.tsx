// @vitest-environment jsdom
import type { MessagingId } from "@halonicjs/ports";
import type { ChatClicks } from "@halonicjs/studio-services";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act, StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Messenger } from "../messenger.ts";
import { settle } from "../test-support/page.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { MessengerPage } from "./messenger-page.tsx";

afterEach(unmountAll);

/** Acme's Liam and Chief, each with a chat. */
function acmeChats() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const liam = messaging.addAgent(acme.id, { name: "Liam" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const liamChat = messaging.addConversation(liam.id, { title: "Chat with Liam" });
  const chiefChat = messaging.addConversation(chief.id, { title: "Chat with Chief" });
  return { messaging, liamChat: liamChat.id, chiefChat: chiefChat.id };
}

/** The shell's chats for the window: `pending` waits for the page, `hand` sends a later one. */
function shellChats(pending: MessagingId | undefined) {
  const listeners = new Set<(chat: MessagingId) => void>();
  let takes = 0;
  const chats: ChatClicks = {
    takePending: () => {
      takes += 1;
      return Promise.resolve(pending);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const hand = async (chat: MessagingId) => {
    await act(async () => {
      for (const listener of listeners) listener(chat);
    });
    await settle();
  };
  return { chats, hand, listening: () => listeners.size, takes: () => takes };
}

async function openWith(messaging: FakeAgentMessaging, chats: ChatClicks): Promise<HTMLElement> {
  const page = render(
    <StrictMode>
      <MessengerPage messenger={new Messenger(messaging)} chats={chats} />
    </StrictMode>,
  );
  await settle();
  return page;
}

function header(page: HTMLElement): string | null | undefined {
  return page.querySelector("main h2")?.textContent;
}

verifies("messenger.handed-chats", () => {
  describe("a chat the shell hands Messenger's window", () => {
    it("opens the chat the window was opened on, once the page starts", async () => {
      const { messaging, chiefChat } = acmeChats();
      const shell = shellChats(chiefChat);
      const page = await openWith(messaging, shell.chats);
      expect(header(page)).toBe("Chief");
      expect(shell.listening()).toBe(1);
    });

    it("opens each later chat it is handed, in place of the open one", async () => {
      const { messaging, liamChat, chiefChat } = acmeChats();
      const shell = shellChats(undefined);
      const page = await openWith(messaging, shell.chats);
      expect(page.querySelector("main h2")).toBeNull();
      await shell.hand(liamChat);
      expect(header(page)).toBe("Liam");
      await shell.hand(chiefChat);
      expect(header(page)).toBe("Chief");
    });

    it("stops hearing chats once the page closes", async () => {
      const { messaging } = acmeChats();
      const shell = shellChats(undefined);
      await openWith(messaging, shell.chats);
      unmountAll();
      expect(shell.listening()).toBe(0);
    });
  });
});
