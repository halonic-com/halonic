import type { ItemRef, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { codePageItem, codePageKey, paneFile, treeContext } from "./code-page.ts";
import { fileItem } from "./file-item.ts";
import { codeRailEntry } from "./rail-entry.ts";

/** A window's context with spies for the ways the tree reaches out. */
function windowContext() {
  const openItem = vi.fn<(item: ItemRef, options?: { step?: string }) => void>();
  const context = { openItem } as unknown as WorkspaceContext;
  return { context, openItem };
}

verifies("files.code-page", () => {
  it("opens Code's page from the rail, which stays selected on the page and on a file", () => {
    expect(codeRailEntry.opens).toBe(codePageKey);
    expect(codePageKey).toBe("code/workspace/files");
    expect(codeRailEntry.holds).toEqual([codePageItem.kind, "file"]);
  });

  it("shows a file the tree opens in the pane, and keeps the tab where it is", () => {
    const { context, openItem } = windowContext();
    const pane = paneFile();
    treeContext(context, pane).openItem?.(fileItem("src/checkout/orders.ts"));

    expect(pane.get()).toBe("src/checkout/orders.ts");
    expect(openItem).not.toHaveBeenCalled();
  });

  it("marks the pane's file as the open one, and tells the tree when it changes", () => {
    const { context } = windowContext();
    const pane = paneFile();
    const active = treeContext(context, pane).activeItem;
    const heard = vi.fn();
    active?.subscribe(heard);

    expect(active?.get()).toBeNull();
    pane.show("README.md");
    expect(active?.get()).toEqual(fileItem("README.md"));
    expect(active?.get()).toBe(active?.get());
    expect(heard).toHaveBeenCalledTimes(1);
    pane.show("README.md");
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("leaves a file asked for at a step, and every other item, to the window", () => {
    const { context, openItem } = windowContext();
    const pane = paneFile();
    const tree = treeContext(context, pane);
    const agent: ItemRef = { kind: "agent", hub: "acme", id: "sorter" };
    tree.openItem?.(agent);
    tree.openItem?.(fileItem("models.yaml"), { step: "4" });

    expect(openItem.mock.calls).toEqual([
      [agent, undefined],
      [fileItem("models.yaml"), { step: "4" }],
    ]);
    expect(pane.get()).toBeUndefined();
  });
});
