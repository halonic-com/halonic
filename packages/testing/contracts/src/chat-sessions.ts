import type { ChatSessions, SavedChat } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One empty chat store under test, and a way to damage what it holds. */
export interface ChatSessionsHarness {
  store: ChatSessions;
  /**
   * Makes the saved chat `id` of `location` unreadable, the way a damaged file or one a newer
   * Halonic wrote would be. The suite only damages chats it saved.
   */
  damage(location: string, id: string): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeChatSessions = () => Promise<ChatSessionsHarness>;

/** A Build chat with one message each way, last used at `lastUsedAt`. */
export function savedChat(id: string, lastUsedAt = "2026-11-23T10:00:00.000Z"): SavedChat {
  return {
    id,
    kind: "build",
    title: `Chat ${id}`,
    lastUsedAt,
    answering: false,
    model: { kind: "alias", name: "smart" },
    messages: [
      { role: "user", content: `Chat ${id}` },
      { role: "assistant", content: "Done." },
    ],
  };
}

/** The contract every {@link ChatSessions} adapter passes. The port only stores; it decides nothing. */
export function chatSessionsContract(name: string, make: MakeChatSessions): void {
  verifies("contracts.chat-sessions", () => {
    describe(`ChatSessions contract: ${name}`, () => {
      storageCases(make);
      orderCases(make);
      workspaceCases(make);
      damageCases(make);
    });
  });
}

const acme = "/workspaces/acme";

function summaryOf({ messages: _messages, model: _model, ...summary }: SavedChat) {
  return summary;
}

function storageCases(make: MakeChatSessions): void {
  it("starts empty, and gives back every field of a saved chat", async () => {
    const { store } = await make();
    expect(await store.list(acme)).toEqual([]);
    expect(await store.load(acme, "c-1")).toBeNull();
    const agentChat: SavedChat = {
      ...savedChat("c-1"),
      kind: "agent:support/triage",
      answering: true,
      model: { kind: "assistant" },
      messages: [
        { role: "user", content: "Sort it" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "t1", name: "read_file", arguments: { path: "a.yaml" } }],
          replay: { type: "anthropic", data: [{ type: "text" }] },
        },
        { role: "tool", content: "id: a", toolCallId: "t1", name: "read_file" },
      ],
    };
    await store.save(acme, agentChat);
    expect(await store.load(acme, "c-1")).toEqual(agentChat);
    expect(await store.list(acme)).toEqual([summaryOf(agentChat)]);
  });

  it("gives back the item a Build chat is about, in the list too, and reads a chat without one", async () => {
    const { store } = await make();
    const about: SavedChat = {
      ...savedChat("c-1"),
      about: { kind: "workflow", hub: "support", id: "triage" },
    };
    await store.save(acme, about);
    await store.save(acme, savedChat("c-2", "2026-11-23T09:00:00.000Z"));
    expect(await store.load(acme, "c-1")).toEqual(about);
    expect(await store.load(acme, "c-2")).toEqual(savedChat("c-2", "2026-11-23T09:00:00.000Z"));
    const listed = await store.list(acme);
    expect(listed[0]?.about).toEqual(about.about);
    expect(listed[1]).not.toHaveProperty("about");
  });

  it("replaces a chat saved again, and deletes one, missing or not", async () => {
    const { store } = await make();
    await store.save(acme, savedChat("c-1"));
    const renamed = { ...savedChat("c-1"), title: "Renamed" };
    await store.save(acme, renamed);
    expect(await store.load(acme, "c-1")).toEqual(renamed);
    expect(await store.list(acme)).toHaveLength(1);
    await store.delete(acme, "c-1");
    expect(await store.load(acme, "c-1")).toBeNull();
    await store.delete(acme, "c-1");
    await store.delete("/workspaces/never", "c-9");
  });

  it("keeps what was saved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const saved = savedChat("c-1");
    await store.save(acme, saved);
    saved.title = "Changed";
    saved.messages.push({ role: "user", content: "More" });
    const read = await store.load(acme, "c-1");
    read?.messages.pop();
    expect(await store.load(acme, "c-1")).toEqual(savedChat("c-1"));
  });

  it("refuses an id that isn't a saved chat id, and finds nothing under one", async () => {
    const { store } = await make();
    for (const id of ["../c-1", "C-1", "", "a/b"]) {
      await expect(store.save(acme, { ...savedChat("c-1"), id }), id).rejects.toThrow(RangeError);
      expect(await store.load(acme, id)).toBeNull();
      await store.delete(acme, id);
    }
    expect(await store.list(acme)).toEqual([]);
  });
}

function orderCases(make: MakeChatSessions): void {
  it("lists the most recently used first, then by id", async () => {
    const { store } = await make();
    await store.save(acme, savedChat("b", "2026-11-23T10:00:00.000Z"));
    await store.save(acme, savedChat("c", "2026-11-23T11:00:00.000Z"));
    await store.save(acme, savedChat("a", "2026-11-23T10:00:00.000Z"));
    await store.save(acme, savedChat("d", "2026-11-22T23:00:00.000+01:00"));
    const ids = (await store.list(acme)).map((chat) => chat.id);
    expect(ids).toEqual(["c", "a", "b", "d"]);
  });
}

function workspaceCases(make: MakeChatSessions): void {
  it("keeps each workspace's chats apart, comparing locations exactly", async () => {
    const { store } = await make();
    await store.save(acme, savedChat("c-1"));
    await store.save("/workspaces/globex", { ...savedChat("c-1"), title: "Globex" });
    for (const other of [
      "/workspaces/acme/",
      "/Workspaces/acme",
      "/workspaces",
      "/workspaces/acme/c-1",
    ]) {
      expect(await store.list(other), other).toEqual([]);
      expect(await store.load(other, "c-1"), other).toBeNull();
    }
    await store.delete("/workspaces/globex", "c-1");
    expect(await store.load(acme, "c-1")).toEqual(savedChat("c-1"));
  });
}

function damageCases(make: MakeChatSessions): void {
  it("leaves a damaged chat out, and still deletes or replaces it", async () => {
    const harness = await make();
    await harness.store.save(acme, savedChat("c-1"));
    await harness.store.save(acme, savedChat("c-2"));
    await harness.damage(acme, "c-1");
    expect((await harness.store.list(acme)).map((chat) => chat.id)).toEqual(["c-2"]);
    expect(await harness.store.load(acme, "c-1")).toBeNull();
    await harness.store.save(acme, savedChat("c-1"));
    expect(await harness.store.load(acme, "c-1")).toEqual(savedChat("c-1"));
    await harness.damage(acme, "c-1");
    await harness.store.delete(acme, "c-1");
    await harness.store.save(acme, savedChat("c-3"));
    expect((await harness.store.list(acme)).map((chat) => chat.id)).toEqual(["c-2", "c-3"]);
  });
}
