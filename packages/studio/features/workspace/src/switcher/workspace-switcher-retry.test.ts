import { KindedError } from "@halonicjs/std";
import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import { folderName, type OpenedWorkspace, WorkspaceSwitcher } from "./workspace-switcher.ts";

function opened(name: string): OpenedWorkspace {
  return {
    name,
    workspace: { dispose: vi.fn() } as unknown as StudioWorkspace,
    dispose: async () => {},
  };
}

verifies("workspace.open-folder", () => {
  it("retries only the opening of the picked folder, asking for a folder once", async () => {
    vi.useFakeTimers();
    try {
      let answers = 0;
      const pickFolder = vi.fn(async () => "/work/acme");
      const openFolder = vi.fn(async (location: string) => {
        answers += 1;
        if (answers < 3) throw new KindedError("unavailable", "no answer");
        return opened(folderName(location));
      });
      const storage = { getItem: () => null, setItem: () => {} };
      const switcher = new WorkspaceSwitcher({
        pickFolder,
        openFolder,
        recent: new RecentWorkspaces(storage),
        toasts: createToastStore(),
      });

      const pending = switcher.pickAndOpen();
      await vi.advanceTimersByTimeAsync(2_000);

      expect(await pending).toBeUndefined();
      expect(pickFolder).toHaveBeenCalledTimes(1);
      expect(openFolder).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
