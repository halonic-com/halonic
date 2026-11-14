import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { onWindowCloseRequested } from "./tauri-close.ts";

/** A webview whose close button can be pressed: `press()` runs the page's registered listener. */
function webview() {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const callbacks = new Map<number, (message: unknown) => void>();
  const internals = {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
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
      const stop = onWindowCloseRequested({}, async () => {});
      await expect(stop()).resolves.toBeUndefined();
    });

    it("listens for the window's close request", () => {
      const { page, calls } = webview();
      onWindowCloseRequested(page, async () => {});
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
      onWindowCloseRequested(page, () => new Promise<void>((resolve) => (finish = resolve)));
      press();
      await settle();
      expect(calls.map(([command]) => command)).not.toContain("plugin:window|destroy");
      finish();
      await settle();
      expect(calls.at(-1)).toEqual(["plugin:window|destroy", { label: "main" }]);
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
      const stop = onWindowCloseRequested(page, async () => {});
      await stop();
      expect(registered()).toBe(0);
      expect(calls.at(-1)).toEqual([
        "plugin:event|unlisten",
        { event: "tauri://close-requested", eventId: 41 },
      ]);
    });
  });
});
