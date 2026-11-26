import { ServiceRegistry } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { keepFocusedContent, type ShownInApp, shownInApp } from "./focused-window-content.ts";
import { WindowContentKeeper } from "./window-content.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A Messenger's chat, as `shownInApp` gives it, with chats `listed`. */
function chatShown(listed: readonly string[]) {
  let current: string | undefined;
  const watchers = new Set<() => void>();
  const shown = {
    field: "chat",
    current: () => current,
    watch: (watcher: () => void) => {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
    reopen: vi.fn(async (kept: string, _signal: AbortSignal) => listed.includes(kept)),
  } satisfies ShownInApp;
  const show = (chat: string | undefined) => {
    current = chat;
    for (const watcher of watchers) watcher();
  };
  return { shown, show };
}

/** The shell's `window_content_set`, recording what it was given. */
function shellKeeping() {
  const invoke = vi.fn(async (_command: string, _args?: Record<string, unknown>) => null);
  const kept = () => invoke.mock.calls.map(([, args]) => args?.["content"]);
  return { keeper: new WindowContentKeeper({ invoke }), kept };
}

verifies("studio.window-content", () => {
  describe("keepFocusedContent", () => {
    it("shows the kept chat again and keeps each chat shown, with its workspace", async () => {
      const { shown, show } = chatShown(["chat-1", "chat-2"]);
      const { keeper, kept } = shellKeeping();
      const content = { workspace: "/work/acme", chat: "chat-1" };

      const keeping = keepFocusedContent(keeper, shown, "/work/acme", content);
      await keeping.ready;
      show("chat-1");
      show("chat-2");
      await vi.waitFor(() => expect(kept()).toHaveLength(2));
      keeping.stop();

      expect(shown.reopen).toHaveBeenCalledWith("chat-1", expect.any(AbortSignal));
      expect(kept()).toEqual([
        '{"workspace":"/work/acme","chat":"chat-1"}',
        '{"workspace":"/work/acme","chat":"chat-2"}',
      ]);
    });

    it("shows the start screen when the kept chat is gone", async () => {
      const { shown } = chatShown(["chat-2"]);
      const { keeper, kept } = shellKeeping();
      const content = { workspace: "/work/acme", chat: "chat-1" };

      await keepFocusedContent(keeper, shown, "/work/acme", content).ready;

      expect(kept()).toEqual(['{"workspace":"/work/acme"}']);
    });

    it("doesn't ask for a chat kept with another workspace", async () => {
      const { shown } = chatShown(["chat-1"]);
      const { keeper, kept } = shellKeeping();
      const content = { workspace: "/work/beta", chat: "chat-1" };

      await keepFocusedContent(keeper, shown, "/work/acme", content).ready;

      expect(shown.reopen).not.toHaveBeenCalled();
      expect(kept()).toEqual(['{"workspace":"/work/acme"}']);
    });

    it("says in the console when the chat can't be asked for, and shows the start screen", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const { shown } = chatShown([]);
      shown.reopen.mockRejectedValueOnce(new Error("engine gone"));
      const { keeper, kept } = shellKeeping();

      await keepFocusedContent(keeper, shown, "/work/acme", {
        chat: "chat-1",
        workspace: "/work/acme",
      }).ready;

      expect(error).toHaveBeenCalledWith(expect.stringContaining("chat"), expect.any(Error));
      expect(kept()).toEqual(['{"workspace":"/work/acme"}']);
    });

    it("stops at once while the chat is still being asked for, and keeps nothing after", async () => {
      const { shown, show } = chatShown(["chat-1"]);
      shown.reopen.mockImplementationOnce(() => new Promise<boolean>(() => {}));
      const { keeper, kept } = shellKeeping();

      const keeping = keepFocusedContent(keeper, shown, "/work/acme", {
        chat: "chat-1",
        workspace: "/work/acme",
      });
      keeping.stop();
      show("chat-2");

      const signal = shown.reopen.mock.calls[0]?.[1];
      expect(signal?.aborted).toBe(true);
      expect(kept()).toEqual([]);
    });

    it("keeps a chat opened while the kept one is being asked for", async () => {
      const { shown, show } = chatShown(["chat-1"]);
      let answer = (_listed: boolean): void => {};
      shown.reopen.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (answer = resolve)),
      );
      const { keeper, kept } = shellKeeping();

      const keeping = keepFocusedContent(keeper, shown, "/work/acme", {
        chat: "chat-1",
        workspace: "/work/acme",
      });
      show("chat-2");
      answer(true);
      await keeping.ready;
      keeping.stop();

      expect(kept()).toEqual(['{"workspace":"/work/acme","chat":"chat-2"}']);
    });
  });

  describe("shownInApp", () => {
    it("gives nothing for a workspace without the app, or for another focused app", () => {
      const services = new ServiceRegistry();

      expect(shownInApp("messenger", services)).toBeUndefined();
      expect(shownInApp("inbox", services)).toBeUndefined();
      expect(shownInApp("ask", services)).toBeUndefined();
    });
  });
});
