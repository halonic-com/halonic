import {
  type OpenedWorkspace,
  RecentWorkspaces,
  type WorkspaceSaving,
  WorkspaceSwitcher,
} from "@halonicjs/studio-feature-workspace";
import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeLimitMs, withinLimit } from "./start-studio.ts";
import { windowCloseHandler } from "./window-close.ts";

/** A workspace whose save ends when the test says so: `saved(true)`, `saved(false)`, or `crash()`. */
function slowWorkspace(name: string) {
  let finish: (saved: boolean) => void = () => {};
  let crash: (error: Error) => void = () => {};
  const saving = {
    saveNow: () =>
      new Promise<boolean>((resolve, reject) => {
        finish = resolve;
        crash = reject;
      }),
    problem: undefined,
    dispose: () => {},
  } as unknown as WorkspaceSaving;
  const workspace: OpenedWorkspace = {
    name,
    workspace: { dispose: () => {} } as unknown as StudioWorkspace,
    saving,
    dispose: async () => {},
  };
  return {
    workspace,
    saved: (saved: boolean) => finish(saved),
    crash: (error: Error) => crash(error),
  };
}

async function closing() {
  const acme = slowWorkspace("Acme");
  const switcher = new WorkspaceSwitcher({
    pickFolder: async () => undefined,
    openFolder: async () => acme.workspace,
    recent: new RecentWorkspaces({ getItem: () => null, setItem: () => {} }),
    toasts: createToastStore(),
  });
  await switcher.openLocation("/work/acme");
  const stop = vi.fn(async () => {});
  const destroy = vi.fn(async () => {});
  const handler = windowCloseHandler({
    workspaces: switcher,
    stop,
    limitMs: closeLimitMs,
    within: withinLimit,
  });
  return { acme, switcher, stop, destroy, handler };
}

verifies("workspace.saves-itself", () => {
  describe("when the person closes the window", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps the window open on "Close Acme?" when a save is still running after the limit', async () => {
      const { switcher, stop, destroy, handler } = await closing();

      const answer = handler(destroy);
      await vi.advanceTimersByTimeAsync(closeLimitMs - 1);
      expect(switcher.closeRequest).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);

      expect(await answer).toBe(false);
      expect(switcher.closeRequest).toMatchObject({ name: "Acme", reason: "still-saving" });
      expect(stop).not.toHaveBeenCalled();
      expect(destroy).not.toHaveBeenCalled();
    });

    it('keeps the window open on "Close Acme?" when a save throws', async () => {
      const { acme, switcher, stop, destroy, handler } = await closing();

      const answer = handler(destroy);
      acme.crash(new Error("The share went away."));

      expect(await answer).toBe(false);
      expect(switcher.closeRequest).toMatchObject({ name: "Acme", reason: "failed" });
      expect(stop).not.toHaveBeenCalled();
    });

    it("closes the window when the save ends while the question is open", async () => {
      const { acme, switcher, stop, destroy, handler } = await closing();
      const answer = handler(destroy);
      await vi.advanceTimersByTimeAsync(closeLimitMs);
      expect(await answer).toBe(false);

      acme.saved(true);
      await vi.advanceTimersByTimeAsync(0);

      expect(switcher.closeRequest).toBeUndefined();
      expect(stop).toHaveBeenCalledOnce();
      expect(destroy).toHaveBeenCalledOnce();
    });

    it("leaves the window to the person once they answered the question", async () => {
      const { acme, switcher, stop, destroy, handler } = await closing();
      const answer = handler(destroy);
      await vi.advanceTimersByTimeAsync(closeLimitMs);
      expect(await answer).toBe(false);

      switcher.cancelClose();
      acme.saved(true);
      await vi.advanceTimersByTimeAsync(0);

      expect(stop).not.toHaveBeenCalled();
      expect(destroy).not.toHaveBeenCalled();
    });

    it("asks about the failure when the save ends badly after the limit", async () => {
      const { acme, switcher, destroy, handler } = await closing();
      const answer = handler(destroy);
      await vi.advanceTimersByTimeAsync(closeLimitMs);
      expect(await answer).toBe(false);

      acme.saved(false);
      await vi.advanceTimersByTimeAsync(0);

      expect(switcher.closeRequest).toMatchObject({ name: "Acme", reason: "failed" });
      expect(destroy).not.toHaveBeenCalled();
    });

    it("closes at once when every save works", async () => {
      const { acme, stop, destroy, handler } = await closing();
      const answer = handler(destroy);
      acme.saved(true);

      expect(await answer).toBe(true);
      expect(stop).toHaveBeenCalledOnce();
    });
  });
});
