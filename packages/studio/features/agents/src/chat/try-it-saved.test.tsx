// @vitest-environment jsdom
import type { SavedChat } from "@halonicjs/ports";
import { WorkspaceUntrusted } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { show, unmount } from "../test-support.tsx";
import { Chat, memorySessions, said, scriptedHost, sendMessage } from "./try-it-test-support.tsx";

afterEach(() => unmount());

const buildChat: SavedChat = {
  id: "c-1",
  kind: "build",
  title: "Add a routine",
  lastUsedAt: "2026-11-01T10:00:00.000Z",
  answering: false,
  model: { kind: "assistant" },
  messages: [{ role: "user", content: "Add a routine" }],
};

verifies("agents.chat.saved", () => {
  it("Try it chat is saved as an agent session and reloads", async () => {
    const sessions = memorySessions();
    const location = "/acme";
    await sessions.save(location, buildChat);
    const { host, requests, finish } = scriptedHost({ savedChats: { sessions, location } });

    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort today's mail");
    const reply = { role: "assistant", content: "Sorted 3 messages." } as const;
    await act(async () => requests[0]?.listener?.onMessage?.(reply));
    await finish({ messages: [reply], end: { reason: "answered" } });

    await vi.waitFor(async () =>
      expect((await sessions.list(location)).map((chat) => chat.kind)).toEqual([
        "agent:acme/sorter",
        "build",
      ]),
    );
    const [saved] = await sessions.list(location);
    expect(saved?.title).toBe("Sort today's mail");

    unmount();
    const again = await show(<Chat host={host} announce={vi.fn()} />);
    await vi.waitFor(() =>
      expect(said(again)).toEqual(["Sort today's mail", "Sorted 3 messages."]),
    );
  });

  it("doesn't save a message the untrusted workspace refused", async () => {
    const sessions = memorySessions();
    const location = "/acme";
    await sessions.save(location, buildChat);
    const { host, finish } = scriptedHost({ savedChats: { sessions, location } });

    const page = await show(<Chat host={host} announce={vi.fn()} />);
    await sendMessage(page, "Sort today's mail");
    await finish(new WorkspaceUntrusted("This workspace isn't trusted."));
    await act(async () => {});

    expect((await sessions.list(location)).map((chat) => chat.kind)).toEqual(["build"]);
  });
});
