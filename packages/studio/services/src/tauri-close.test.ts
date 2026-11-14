import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { onWindowCloseRequested } from "./tauri-close.ts";

/** A webview whose close button can be pressed: `press()` runs the page's registered listener. */
function webview(failing: string[] = []) {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const callbacks = new Map<number, (message: unknown) => void>();
  const internals = {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      if (failing.includes(command)) throw new Error(`${command} refused`);
      return command === "plugin:event|listen" ? 41 : null;
    },
    transformCallback: (callback: (message: unknown) => void) => {
      callbacks.set(5, callback);
      return 5;
    },
    unregisterCallback: (id: number) => callbacks.delete(id),
  };
  return {
    calls,
    page: { __TAURI_INTERNALS__: internals },
    press: () => callbacks.get(5)?.({}),
    registered: () => callbacks.size,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

verifies("services.tauri-ipc", () => {
  describe("onWindowCloseRequested", () => {
    it("registers nothing on a page outside the shell", async () => {
      const stop = onWindowCloseRequested({}, async () => undefined);
      await expect(stop()).resolves.toBeUndefined();
    });

    it("listens for the window's close request", () => {
      const { page, calls } = webview();
      onWindowCloseRequested(page, async () => undefined);
      expect(calls).toEqual([
        [
          "plugin:event|listen",
          {
            event: "tauri://close-requested",
            target: { kind: "Window", label: "main" },
            handler: 5,
          },
        ],
      ]);
    });

    it("destroys the window only after the handler has finished", async () => {
      const { page, calls, press } = webview();
      let finish = () => {};
      onWindowCloseRequested(
        page,
        () => new Promise<undefined>((resolve) => (finish = () => resolve(undefined))),
      );
      press();
      await settle();
      expect(calls.map(([command]) => command)).not.toContain("plugin:window|destroy");
      finish();
      await settle();
      expect(calls.at(-1)).toEqual(["plugin:window|destroy", { label: "main" }]);
    });

    it("keeps the window open when the handler resolves false", async () => {
      const { page, calls, press } = webview();
      onWindowCloseRequested(page, async () => false);
      press();
      await settle();
      expect(calls.map(([command]) => command)).not.toContain("plugin:window|destroy");
    });

    it("still destroys the window when the handler fails", async () => {
      const { page, calls, press } = webview();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      onWindowCloseRequested(page, async () => {
        throw new Error("save failed");
      });
      press();
      await settle();
      expect(calls.at(-1)?.[0]).toBe("plugin:window|destroy");
      error.mockRestore();
    });

    it("stops listening, so a later close is Tauri's own", async () => {
      const { page, calls, registered } = webview();
      const stop = onWindowCloseRequested(page, async () => undefined);
      await stop();
      expect(registered()).toBe(0);
      expect(calls.at(-1)).toEqual([
        "plugin:event|unlisten",
        { event: "tauri://close-requested", eventId: 41 },
      ]);
    });

    it("reports a window that will not close", async () => {
      const { page, press } = webview(["plugin:window|destroy"]);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      onWindowCloseRequested(page, async () => undefined);
      press();
      await settle();
      expect(error).toHaveBeenCalledTimes(1);
      error.mockRestore();
    });

    it("gives the callback back when listening is refused, and stops quietly", async () => {
      const { page, calls, registered } = webview(["plugin:event|listen"]);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const stop = onWindowCloseRequested(page, async () => undefined);
      await stop();
      expect(registered()).toBe(0);
      expect(error).toHaveBeenCalledTimes(1);
      expect(calls.map(([command]) => command)).toEqual(["plugin:event|listen"]);
      error.mockRestore();
    });

    it("stops quietly when the unlisten call is refused", async () => {
      const { page } = webview(["plugin:event|unlisten"]);
      const stop = onWindowCloseRequested(page, async () => undefined);
      await expect(stop()).resolves.toBeUndefined();
    });
  });
});
