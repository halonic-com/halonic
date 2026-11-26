import { OpenWorkspaces, RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import type { WelcomeOpenProblem } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locationToOpen } from "./start-focused-app.ts";
import { type ContentSwitcher, keepStudioWorkspace } from "./studio-window-content.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A switcher whose Recent holds `remembered`, and whose open shows a location at once. */
function switcherWith(remembered: readonly string[]) {
  const values = new Map<string, string>();
  const recent = new RecentWorkspaces({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  for (const location of remembered) recent.remember({ location, name: location });
  const open = new OpenWorkspaces<object>();
  const openLocation = vi.fn(async (location: string): Promise<WelcomeOpenProblem | undefined> => {
    open.add(location, {});
    return undefined;
  });
  return { open, recent, openLocation } satisfies ContentSwitcher;
}

/** The shell's two commands, answering `kept` to `window_content_get`. */
function shellKeeping(kept: unknown) {
  return vi.fn(async (command: string, _args?: Record<string, unknown>) =>
    command === "window_content_get" ? kept : null,
  );
}

verifies("studio.window-content", () => {
  describe("keepStudioWorkspace", () => {
    it("reopens the workspace it showed, while it is in Recent, and keeps it", async () => {
      const switcher = switcherWith(["/work/acme", "/work/beta"]);
      const invoke = shellKeeping('{"workspace":"/work/beta"}');

      const stop = await keepStudioWorkspace({ invoke }, switcher);

      expect(switcher.openLocation).toHaveBeenCalledWith("/work/beta");
      expect(switcher.open.shown?.location).toBe("/work/beta");
      expect(invoke.mock.calls.at(-1)).toEqual([
        "window_content_set",
        { content: '{"workspace":"/work/beta"}' },
      ]);
      stop();
    });

    it("stays on Welcome when the workspace it showed is gone from Recent", async () => {
      const switcher = switcherWith(["/work/acme"]);
      const invoke = shellKeeping('{"workspace":"/work/beta"}');

      const stop = await keepStudioWorkspace({ invoke }, switcher);

      expect(switcher.openLocation).not.toHaveBeenCalled();
      expect(switcher.open.shown).toBeUndefined();
      expect(invoke.mock.calls.at(-1)).toEqual(["window_content_set", { content: null }]);
      stop();
    });

    it("stays on Welcome for malformed content", async () => {
      const switcher = switcherWith(["/work/acme"]);

      const stop = await keepStudioWorkspace({ invoke: shellKeeping("{workspace") }, switcher);

      expect(switcher.openLocation).not.toHaveBeenCalled();
      stop();
    });

    it("says in the console why a kept workspace didn't open", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const switcher = switcherWith(["/work/acme"]);
      const problem = { folder: "acme", reason: "It was moved.", kind: "not_found" as const };
      switcher.openLocation.mockResolvedValueOnce(problem);

      const stop = await keepStudioWorkspace(
        { invoke: shellKeeping('{"workspace":"/work/acme"}') },
        switcher,
      );

      expect(switcher.open.shown).toBeUndefined();
      expect(error).toHaveBeenCalledWith(expect.stringContaining("/work/acme"), problem);
      stop();
    });

    it("keeps the workspace shown each time it changes, until stopped", async () => {
      const switcher = switcherWith(["/work/acme"]);
      const invoke = shellKeeping(null);
      const stop = await keepStudioWorkspace({ invoke }, switcher);

      switcher.open.add("/work/acme", {});
      await vi.waitFor(() =>
        expect(invoke).toHaveBeenLastCalledWith("window_content_set", {
          content: '{"workspace":"/work/acme"}',
        }),
      );
      stop();
      switcher.open.close("/work/acme");
      await Promise.resolve();

      expect(invoke).toHaveBeenLastCalledWith("window_content_set", {
        content: '{"workspace":"/work/acme"}',
      });
    });
  });

  describe("locationToOpen", () => {
    const recent = [{ location: "/work/acme" }, { location: "/work/beta" }];

    it("opens the workspace a focused app showed, while it is in Recent", () => {
      expect(locationToOpen(recent, { workspace: "/work/beta" })).toBe("/work/beta");
    });

    it("else opens the first in Recent", () => {
      expect(locationToOpen(recent, { workspace: "/work/gone" })).toBe("/work/acme");
      expect(locationToOpen(recent, {})).toBe("/work/acme");
    });

    it("opens nothing with nothing in Recent", () => {
      expect(locationToOpen([], { workspace: "/work/acme" })).toBeUndefined();
    });
  });
});
