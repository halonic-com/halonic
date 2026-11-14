import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { describe, expect, it, vi } from "vitest";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import type { WorkspaceSaving } from "./workspace-saving.ts";
import { type OpenedWorkspace, WorkspaceSwitcher } from "./workspace-switcher.ts";

/** An open workspace whose saving answers `saveNow` with `answer` and logs the order of calls. */
function openedWithSaving(name: string, answer: boolean, order: string[]) {
  let disposed = false;
  const saving = {
    saveNow: async () => {
      order.push(`save ${name}`);
      return answer;
    },
    dispose: () => order.push(`dispose ${name}`),
  } as unknown as WorkspaceSaving;
  const workspace: OpenedWorkspace = {
    name,
    workspace: { dispose: vi.fn() } as unknown as StudioWorkspace,
    saving,
    dispose: async () => {
      disposed = true;
    },
  };
  return { workspace, disposed: () => disposed };
}

describe("when the window goes", () => {
  it("saves what is waiting in every workspace first, even when one save fails", async () => {
    const order: string[] = [];
    const acme = openedWithSaving("Acme", false, order);
    const beta = openedWithSaving("Beta", true, order);
    const switcher = new WorkspaceSwitcher({
      pickFolder: async () => undefined,
      openFolder: async (location) => (location === "/work/acme" ? acme : beta).workspace,
      recent: new RecentWorkspaces({ getItem: () => null, setItem: () => {} }),
      toasts: createToastStore(),
    });
    await switcher.openLocation("/work/acme");
    await switcher.openLocation("/work/beta");

    await switcher.dispose();
    expect(order).toEqual(["save Acme", "dispose Acme", "save Beta", "dispose Beta"]);
    expect([acme.disposed(), beta.disposed()]).toEqual([true, true]);
  });
});
