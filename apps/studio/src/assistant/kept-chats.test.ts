import { MemoryChatSessions } from "@halonicjs/adapter-memory";
import type { ChatMessage, ChatSessions, SavedChat } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { KeptChats } from "./kept-chats.ts";

/** An empty store for each test, since the 40 are counted on the store's list. */
function newStore() {
  return { sessions: new MemoryChatSessions(), location: "memory:acme" };
}

/** A clock one second further on every call, so each chat is used after the one before. */
function ticking(): () => Date {
  let seconds = 0;
  return () => new Date(Date.UTC(2026, 10, 24, 8, 0, seconds++));
}

verifies("studio.workspace-assistant", () => {
  describe("KeptChats", () => {
    it("says which chat went when a 41st chat is kept, so its tools go too", async () => {
      const gone: string[] = [];
      const chats = new KeptChats({
        store: newStore(),
        now: ticking(),
        onGone: (chatId) => gone.push(chatId),
      });
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

    it("Assistant sees a Try it chat saved in the same window", async () => {
      const shared = { sessions: new MemoryChatSessions(), location: "memory:try-it" };
      const chats = new KeptChats({ store: shared, now: ticking() });
      expect(await chats.list()).toEqual([]);
      const tryIt: SavedChat = {
        id: "try-it-sorter",
        kind: "agent:acme/sorter",
        title: "Sort today's mail",
        lastUsedAt: "2026-11-24T07:00:00.000Z",
        answering: false,
        model: { kind: "assistant" },
        messages: [
          { role: "user", content: "Sort today's mail" },
          { role: "assistant", content: "Sorted 12 messages." },
        ],
      };
      await shared.sessions.save(shared.location, tryIt);
      expect((await chats.list()).map((chat) => chat.id)).toEqual([tryIt.id]);

      // Try it adds a turn after the Assistant has read the chat.
      await chats.get(tryIt.id);
      const turn: ChatMessage[] = [
        { role: "user", content: "And yesterday's?" },
        { role: "assistant", content: "Sorted 3 more." },
      ];
      await shared.sessions.save(shared.location, {
        ...tryIt,
        lastUsedAt: "2026-11-24T07:30:00.000Z",
        messages: [...tryIt.messages, ...turn],
      });

      await chats.get(tryIt.id);
      chats.add(tryIt.id, { role: "user", content: "Thanks" });
      await chats.saved();
      const saved = await shared.sessions.load(shared.location, tryIt.id);
      expect(saved?.messages.map((message) => message.content)).toEqual([
        "Sort today's mail",
        "Sorted 12 messages.",
        "And yesterday's?",
        "Sorted 3 more.",
        "Thanks",
      ]);
    });

    it("counts the Try it chats when it keeps the 40", async () => {
      const shared = { sessions: new MemoryChatSessions(), location: "memory:forty" };
      const gone: string[] = [];
      let now = new Date(Date.UTC(2026, 10, 24, 8));
      const chats = new KeptChats({
        store: shared,
        now: () => now,
        onGone: (chatId) => gone.push(chatId),
      });
      const first = await chats.newChat("build", { kind: "alias", name: "default" });
      chats.add(first.id, { role: "user", content: "First" });
      await chats.saved();
      for (let index = 0; index < 39; index++) {
        await shared.sessions.save(shared.location, {
          id: `try-it-${index}`,
          kind: "agent:acme/sorter",
          title: `Try ${index}`,
          lastUsedAt: new Date(Date.UTC(2026, 10, 24, 9, 0, index)).toISOString(),
          answering: false,
          model: { kind: "assistant" },
          messages: [{ role: "user", content: `Try ${index}` }],
        });
      }
      now = new Date(Date.UTC(2026, 10, 24, 10));
      const last = await chats.newChat("build", { kind: "alias", name: "default" });
      chats.add(last.id, { role: "user", content: "Last" });
      await chats.saved();
      expect(gone).toEqual([first.id]);
      expect(await shared.sessions.list(shared.location)).toHaveLength(40);
    });

    it("reuses an empty draft only when it is about the same item, by kind, hub and id", async () => {
      const chats = new KeptChats({ store: newStore(), now: ticking() });
      const model = { kind: "alias", name: "default" } as const;
      const triage = await chats.newChat("build", model, {
        kind: "workflow",
        hub: "support",
        id: "triage",
      });
      // A copy of the same reference, not the same object.
      const again = await chats.newChat("build", model, {
        kind: "workflow",
        hub: "support",
        id: "triage",
      });
      const other = await chats.newChat("build", model, {
        kind: "workflow",
        hub: "support",
        id: "intake",
      });
      const agent = await chats.newChat("build", model, {
        kind: "agent",
        hub: "support",
        id: "triage",
      });
      const plain = await chats.newChat("build", model);
      expect(again.id).toBe(triage.id);
      expect(new Set([triage.id, other.id, agent.id, plain.id]).size).toBe(4);
      expect(plain).not.toHaveProperty("about");
      expect(await chats.newChat("build", model)).toBe(plain);
    });

    it("saves the item a chat is about, and a new window reads it back", async () => {
      const store = newStore();
      const about = { kind: "skill", hub: "library", id: "tone" } as const;
      const first = new KeptChats({ store, now: ticking() });
      const chat = await first.newChat("build", { kind: "assistant" }, about);
      first.add(chat.id, { role: "user", content: "Make it friendlier" });
      await first.saved();
      expect((await store.sessions.list(store.location))[0]?.about).toEqual(about);

      const next = new KeptChats({ store, now: ticking() });
      expect((await next.get(chat.id)).about).toEqual(about);
    });

    it("says which chat went when it is deleted", async () => {
      const gone: string[] = [];
      const chats = new KeptChats({
        store: newStore(),
        now: ticking(),
        onGone: (chatId) => gone.push(chatId),
      });
      const chat = await chats.newChat("build", { kind: "alias", name: "default" });
      chats.add(chat.id, { role: "user", content: "Hi" });
      await chats.delete(chat.id);
      expect(gone).toEqual([chat.id]);
    });

    it("Assistant lets go of a chat Try it pruned", async () => {
      const store = newStore();
      const gone: string[] = [];
      const chats = new KeptChats({ store, now: ticking(), onGone: (chatId) => gone.push(chatId) });
      const chat = await chats.newChat("build", { kind: "alias", name: "default" });
      chats.add(chat.id, { role: "user", content: "Hi" });
      await chats.saved();

      // Try it prunes the shared store past the 40 on its own.
      await store.sessions.delete(store.location, chat.id);

      expect(await chats.list()).toEqual([]);
      expect(gone).toEqual([chat.id]);
    });

    it("keeps a chat whose save failed in the window", async () => {
      const store = newStore();
      const failed: unknown[] = [];
      // A store that lists, loads and deletes, but can't save.
      const sessions: ChatSessions = {
        list: (location) => store.sessions.list(location),
        load: (location, id) => store.sessions.load(location, id),
        save: () => Promise.reject(new Error("disk full")),
        delete: (location, id) => store.sessions.delete(location, id),
      };
      const failing = { sessions, location: store.location };
      const gone: string[] = [];
      const chats = new KeptChats({
        store: failing,
        now: ticking(),
        onGone: (chatId) => gone.push(chatId),
        onSaveFailed: (error) => failed.push(error),
      });
      const chat = await chats.newChat("build", { kind: "alias", name: "default" });
      chats.add(chat.id, { role: "user", content: "Hi" });
      await chats.saved();

      expect(failed).toHaveLength(1);
      expect((await chats.list()).map((kept) => kept.id)).toEqual([chat.id]);
      expect(gone).toEqual([]);
    });
  });
});
