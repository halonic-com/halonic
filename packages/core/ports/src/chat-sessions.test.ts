import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { type ChatSessions, isSavedChat, type SavedChat, type SavedChatSummary } from "./index.ts";

const chat: SavedChat = {
  id: "c-1",
  kind: "agent:support/triage",
  title: "Sort the inbox",
  lastUsedAt: "2026-11-23T10:42:00.000Z",
  answering: false,
  model: { kind: "alias", name: "smart" },
  messages: [
    { role: "user", content: "Sort the inbox" },
    { role: "assistant", content: "", toolCalls: [{ id: "t1", name: "read_file", arguments: {} }] },
    { role: "tool", content: "id: inbox", toolCallId: "t1", name: "read_file" },
  ],
};

verifies("ports.chat-sessions", () => {
  typeTest("only stores chats: list, load, save and delete", () => {
    expectTypeOf<keyof ChatSessions>().toEqualTypeOf<"list" | "load" | "save" | "delete">();
    expectTypeOf<ChatSessions["list"]>().returns.toEqualTypeOf<Promise<SavedChatSummary[]>>();
    expectTypeOf<ChatSessions["load"]>().returns.toEqualTypeOf<Promise<SavedChat | null>>();
  });

  it("knows a saved chat of either kind, with either model", () => {
    expect(isSavedChat(chat)).toBe(true);
    expect(isSavedChat({ ...chat, kind: "build", model: { kind: "assistant" } })).toBe(true);
  });

  it("knows a Build chat about an item, and refuses a malformed about", () => {
    const build: SavedChat = { ...chat, kind: "build" };
    expect(
      isSavedChat({ ...build, about: { kind: "workflow", hub: "support", id: "triage" } }),
    ).toBe(true);
    for (const about of [
      null,
      "triage",
      { kind: "page", hub: "support", id: "triage" },
      { kind: "workflow", hub: "", id: "triage" },
      { kind: "workflow", hub: "support", id: "" },
      { kind: "workflow", hub: "support" },
    ]) {
      expect(isSavedChat({ ...build, about }), JSON.stringify(about)).toBe(false);
    }
  });

  it("knows a Build chat's docs sites and log, and refuses malformed ones", () => {
    const build: SavedChat = { ...chat, kind: "build" };
    const site = { host: "docs.example.com", answer: "allowed", cardId: "t2" };
    const line = { callId: "t2", at: chat.lastUsedAt, url: "https://docs.example.com/api" };
    const read = { ...line, outcome: "read", status: 200, bytes: 512 };
    expect(isSavedChat({ ...build, docs: { sites: [site], log: [read] } })).toBe(true);
    expect(isSavedChat({ ...build, docs: { sites: [], log: [] } })).toBe(true);
    for (const docs of [
      null,
      { sites: [site] },
      { sites: [{ ...site, answer: "maybe" }], log: [] },
      { sites: [{ ...site, host: "" }], log: [] },
      { sites: [], log: [{ ...read, outcome: "fetched" }] },
      { sites: [], log: [{ ...read, status: "200" }] },
      { sites: [], log: [{ ...read, callId: undefined }] },
    ]) {
      expect(isSavedChat({ ...build, docs }), JSON.stringify(docs)).toBe(false);
    }
  });

  it("refuses an id that couldn't be a file name", () => {
    for (const id of ["../acme", "C-1", "", "-a", "a".repeat(65), 7]) {
      expect(isSavedChat({ ...chat, id })).toBe(false);
    }
  });

  it("refuses an unknown kind, model or message", () => {
    expect(isSavedChat({ ...chat, kind: "agent:" })).toBe(false);
    expect(isSavedChat({ ...chat, kind: "helper" })).toBe(false);
    expect(isSavedChat({ ...chat, model: { kind: "alias" } })).toBe(false);
    expect(isSavedChat({ ...chat, model: null })).toBe(false);
    expect(isSavedChat({ ...chat, messages: [{ role: "robot", content: "hi" }] })).toBe(false);
    expect(isSavedChat({ ...chat, messages: [{ role: "user" }] })).toBe(false);
    expect(isSavedChat({ ...chat, messages: [null] })).toBe(false);
  });

  it("refuses a value with a field of the wrong type, or none at all", () => {
    expect(isSavedChat({ ...chat, answering: "no" })).toBe(false);
    expect(isSavedChat({ ...chat, lastUsedAt: 0 })).toBe(false);
    expect(isSavedChat({ ...chat, messages: "hi" })).toBe(false);
    expect(isSavedChat(null)).toBe(false);
    expect(isSavedChat("chat")).toBe(false);
  });
});
