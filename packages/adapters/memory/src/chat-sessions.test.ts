import { savedChat } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryChatSessions } from "./chat-sessions.ts";

const acme = "/workspaces/acme";

verifies("memory.chat-sessions", () => {
  it("refuses to damage a chat it doesn't hold, naming it and its workspace", async () => {
    const store = new MemoryChatSessions();
    expect(() => store.damage(acme, "c-1")).toThrow(
      'There is no chat "c-1" in "/workspaces/acme" to damage.',
    );
    expect(await store.load(acme, "c-1")).toBeNull();
  });

  it("treats a chat that isn't a valid saved chat as unreadable", async () => {
    const store = new MemoryChatSessions();
    const broken = { ...savedChat("c-1"), messages: [{ role: "user" }] } as never;
    await store.save(acme, broken);
    expect(await store.load(acme, "c-1")).toBeNull();
    expect(await store.list(acme)).toEqual([]);
  });
});
