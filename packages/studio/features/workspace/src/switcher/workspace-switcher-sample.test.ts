import { createToastStore } from "@halonicjs/studio-kit";
import type { StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { RecentWorkspaces } from "./recent-workspaces.ts";
import {
  folderName,
  type OpenedWorkspace,
  WorkspaceSwitcher,
  type WorkspaceSwitcherOptions,
} from "./workspace-switcher.ts";

function opened(name: string): OpenedWorkspace {
  return {
    name,
    workspace: { dispose: vi.fn(), tabs: { openHere: vi.fn() } } as unknown as StudioWorkspace,
    dispose: async () => {},
  };
}

function setup(overrides: Partial<WorkspaceSwitcherOptions> = {}) {
  const values = new Map<string, string>();
  const options: WorkspaceSwitcherOptions = {
    pickFolder: vi.fn(async () => "/work/acme"),
    openFolder: vi.fn(async (location: string) => opened(folderName(location))),
    recent: new RecentWorkspaces({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    }),
    toasts: createToastStore(),
    ...overrides,
  };
  return { switcher: new WorkspaceSwitcher(options) };
}

verifies("workspace.open-folder", () => {
  it("remembers a sample as the sample before its workspace is shown", async () => {
    const { switcher } = setup();
    let sampleWhenShown: boolean | undefined;
    switcher.open.subscribe(() => {
      sampleWhenShown ??= switcher.recent.isSample("/work/acme");
    });

    expect(await switcher.openLocation("/work/acme", undefined, true)).toBeUndefined();

    expect(sampleWhenShown).toBe(true);
    expect(switcher.recent.isSample("/work/acme")).toBe(true);
  });

  it("doesn't remember a folder that fails to open as the sample", async () => {
    const { switcher } = setup({
      openFolder: vi.fn(async () => {
        throw new Error("gone");
      }),
    });

    expect(await switcher.openLocation("/work/acme", undefined, true)).toBeDefined();

    expect(switcher.recent.isSample("/work/acme")).toBe(false);
  });
});
