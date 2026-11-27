import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { buildChatsOf } from "../chat/build-chats.ts";
import { chatOf, fakeHost } from "../test-support.tsx";
import { aiChats } from "./ai-chats.tsx";

const asked = [{ role: "user", content: "Make a triage agent" }] as const;

function contextOf(fake: ReturnType<typeof fakeHost>): WorkspaceContext {
  const services = { get: () => fake.host, find: () => fake.host };
  return { services, announcer: { announce: vi.fn() } } as unknown as WorkspaceContext;
}

verifies("assistant.home.chats", () => {
  it("lists the Build chats with a message, newest message first, and no agent chat", async () => {
    const fake = fakeHost([
      { ...chatOf("older", asked, "Triage"), lastUsedAt: "2026-11-20T09:00:00.000Z" },
      { ...chatOf("agent", asked, "Ask Ada"), kind: "agent:acme/ada" },
      { ...chatOf("newer", asked, "Digest"), lastUsedAt: "2026-11-26T09:00:00.000Z" },
      chatOf("draft"),
    ]);
    const chats = await aiChats.list(contextOf(fake));
    expect(chats.map((chat) => chat.title)).toEqual(["Digest", "Triage"]);
  });

  it("starts a new chat out of the side panel and resolves to its id", async () => {
    const fake = fakeHost();
    const context = contextOf(fake);
    const chatId = await aiChats.newChat(context);
    expect(buildChatsOf(fake.host).inTab(chatId)).toBe(true);
  });

  it("takes an opened chat out of the side panel", () => {
    const fake = fakeHost([chatOf("triage", asked, "Triage")]);
    aiChats.open("triage", contextOf(fake));
    expect(buildChatsOf(fake.host).inTab("triage")).toBe(true);
  });

  it("tells the listener when a chat changes, until it stops", async () => {
    const fake = fakeHost();
    const context = contextOf(fake);
    const listener = vi.fn();
    const stop = aiChats.subscribe(context, listener);
    await fake.host.newChat("build");
    expect(listener).toHaveBeenCalled();
    stop();
    listener.mockClear();
    await fake.host.newChat("build", { kind: "workflow", hub: "acme", id: "triage" });
    expect(listener).not.toHaveBeenCalled();
  });
});
