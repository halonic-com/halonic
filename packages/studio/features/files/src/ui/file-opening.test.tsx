// @vitest-environment jsdom
import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FilesHost } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

afterEach(unmountAll);

const host: FilesHost = {
  list: async () => ({ paths: ["hubs/p/hub.yaml", "models.yaml"], marks: new Map() }),
  subscribe: () => () => {},
  read: async () => null,
  edit: () => {},
  problems: async () => [],
  outside: () => new Map(),
  compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
  settle: async () => {},
};

verifies("files.ui.file-tab", () => {
  it("opens a file in a tab when its row is activated, and marks the open file", async () => {
    const openItem = vi.fn<(item: ItemRef) => void>();
    const context = {
      services: { get: () => host },
      openItem,
      activeItem: {
        get: () => ({ kind: "file", hub: "workspace", id: "models.yaml" }),
        subscribe: () => () => {},
      },
    } as unknown as WorkspaceContext;
    const page = render(<FilesSidebarView context={context} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const row = page.querySelector<HTMLElement>('[data-path="models.yaml"]');
    act(() => row?.click());

    expect(openItem).toHaveBeenCalledWith({
      kind: "file",
      hub: "workspace",
      id: "models.yaml",
    });
    expect(row?.getAttribute("aria-selected")).toBe("true");
  });
});
