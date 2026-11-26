// @vitest-environment jsdom
import { NarrowProvider } from "@halonicjs/studio-kit";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Messenger } from "../messenger.ts";
import { openChat, settle } from "../test-support/page.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { MessengerPage } from "./messenger-page.tsx";

afterEach(unmountAll);

/** Acme with a chat with Chief and one with Liam. */
function acmeChats() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const [chief, liam] = ["Chief", "Liam"].map((name) => messaging.addAgent(acme.id, { name }));
  if (chief === undefined || liam === undefined) throw new Error("no agents");
  const chiefChat = messaging.addConversation(chief.id);
  const liamChat = messaging.addConversation(liam.id);
  return { messenger: new Messenger(messaging), chiefChat, liamChat };
}

async function openPage(messenger: Messenger) {
  const page = render(
    <StrictMode>
      <NarrowProvider narrow={false}>
        <MessengerPage messenger={messenger} />
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

verifies("messenger.window-chat", () => {
  describe("Messenger.reopen", () => {
    it("opens the kept chat while it is listed, asked before the page shows", async () => {
      const { messenger, liamChat } = acmeChats();

      expect(await messenger.reopen(liamChat.id)).toBe(true);
      const page = await openPage(messenger);

      expect(openChatName(page)).toBe("Liam");
      expect(messenger.shown.id).toBe(liamChat.id);
    });

    it("opens the kept chat asked after the page shows", async () => {
      const { messenger, liamChat } = acmeChats();
      const page = await openPage(messenger);

      await act(async () => {
        await messenger.reopen(liamChat.id);
      });
      await settle();

      expect(openChatName(page)).toBe("Liam");
    });

    it("leaves the chats list showing when the kept chat is gone", async () => {
      const { messenger } = acmeChats();

      expect(await messenger.reopen("chat-deleted")).toBe(false);
      const page = await openPage(messenger);

      expect(openChatName(page)).toBeUndefined();
      expect(messenger.shown.id).toBeUndefined();
    });

    it("asks for nothing once its window stops", async () => {
      const { messenger, liamChat } = acmeChats();
      const stopping = new AbortController();
      const reopened = messenger.reopen(liamChat.id, stopping.signal);
      stopping.abort();

      expect(await reopened).toBe(false);
      const page = await openPage(messenger);
      expect(openChatName(page)).toBeUndefined();
    });
  });

  describe("Messenger.shown", () => {
    it("tells its watchers each chat the page shows, once per change", async () => {
      const { messenger, chiefChat, liamChat } = acmeChats();
      const watcher = vi.fn();
      messenger.shown.watch(watcher);
      const page = await openPage(messenger);

      await openChat(page, "Liam");
      await openChat(page, "Chief");

      expect(watcher.mock.calls).toEqual([[liamChat.id], [chiefChat.id]]);
    });
  });
});
