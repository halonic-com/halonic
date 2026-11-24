import { MemoryChatSessions } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { KeptChats } from "./kept-chats.ts";

const store = { sessions: new MemoryChatSessions(), location: "memory:acme" };

/** A clock one second further on every call, so each chat is used after the one before. */
function ticking(): () => Date {
  let seconds = 0;
  return () => new Date(Date.UTC(2026, 10, 24, 8, 0, seconds++));
}

verifies("studio.workspace-assistant", () => {
  describe("KeptChats", () => {
    it("says which chat went when a 41st chat is kept, so its tools go too", async () => {
      const gone: string[] = [];
      const chats = new KeptChats({ store, now: ticking(), onGone: (chatId) => gone.push(chatId) });
      const ids: string[] = [];
      for (let index = 0; index < 41; index++) {
        const chat = await chats.newChat("build", { kind: "alias", name: "default" });
        chats.add(chat.id, { role: "user", content: `Chat ${index}` });
        ids.push(chat.id);
      }
      expect(gone).toEqual([ids[0]]);
      expect(await chats.list()).toHaveLength(40);
      expect((await chats.list()).map((chat) => chat.id)).not.toContain(ids[0]);
    });

    it("says which chat went when it is deleted", async () => {
      const gone: string[] = [];
      const chats = new KeptChats({ store, now: ticking(), onGone: (chatId) => gone.push(chatId) });
      const chat = await chats.newChat("build", { kind: "alias", name: "default" });
      chats.add(chat.id, { role: "user", content: "Hi" });
      await chats.delete(chat.id);
      expect(gone).toEqual([chat.id]);
    });
  });
});
