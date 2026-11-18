// @vitest-environment jsdom
import {
  ClipboardProvider,
  createToastStore,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FilesHost } from "../files-host.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost, contextOf, rowNamed, settled } from "../test-support/sidebar.ts";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restorePopover();
});

async function show(host: FilesHost = contextHost()) {
  const openItemInNewTab = vi.fn();
  const written: string[] = [];
  const toasts: ToastStore = createToastStore();
  const context = { ...contextOf(host), openItemInNewTab } as unknown as WorkspaceContext;
  const page = render(
    <ClipboardProvider
      writeClipboard={async (text) => {
        written.push(text);
        return true;
      }}
    >
      <ToastStoreProvider store={toasts}>
        <FilesSidebarView context={context} />
      </ToastStoreProvider>
    </ClipboardProvider>,
  );
  await settled();
  return { page, openItemInNewTab, written, toasts };
}

/** The labels of the menu's items, or `undefined` while no menu is open. */
const menuItems = () => {
  const menu = document.querySelector<HTMLElement>("[role=menu][data-popover-open]");
  return menu === null
    ? undefined
    : [...menu.querySelectorAll("[role=menuitem]")].map((item) => item.textContent);
};

const rightClick = (row: HTMLElement) =>
  act(async () => {
    row.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const pick = async (label: string) => {
  const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((each) =>
    each.textContent?.startsWith(label),
  );
  await act(async () => item?.click());
  await settled();
};

verifies("files.ui.file-menu", () => {
  it("opens the file's menu on a right-click, with the five items", async () => {
    const { page } = await show();
    await rightClick(rowNamed(page, "models.yaml"));

    const menu = document.querySelector("[role=menu]");
    expect(menu?.getAttribute("aria-label")).toBe("models.yaml menu");
    // Rename and Delete name their keys after their label.
    expect(menuItems()).toEqual([
      "Open",
      "Open in new tab",
      "RenameF2",
      "Copy path",
      "DeleteDelete",
    ]);
  });

  it("opens the same menu with Shift F10", async () => {
    const { page } = await show();
    const row = rowNamed(page, "models.yaml");
    await act(async () => {
      row.dispatchEvent(
        new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }),
      );
    });
    expect(menuItems()).toHaveLength(5);
  });

  it("opens no menu on a folder", async () => {
    const { page } = await show();
    await rightClick(rowNamed(page, "agents"));

    expect(menuItems()).toBeUndefined();
  });

  it("starts the rename in the row when Rename is picked", async () => {
    const { page } = await show();
    await rightClick(rowNamed(page, "models.yaml"));
    await pick("Rename");

    expect(rowNamed(page, "models.yaml").querySelector("input")?.value).toBe("models.yaml");
  });

  it("moves the file to the trash when Delete is picked", async () => {
    const remove = vi.fn(async () => ({ places: 0, undo: async () => {} }));
    const { page } = await show({ ...contextHost(), remove });
    await rightClick(rowNamed(page, "models.yaml"));
    await pick("Delete");

    expect(remove).toHaveBeenCalledWith("models.yaml");
  });

  it("copies the path and says so", async () => {
    const { page, written, toasts } = await show();
    await rightClick(rowNamed(page, "models.yaml"));
    await pick("Copy path");

    expect(written).toEqual(["models.yaml"]);
    expect(toasts.list().map((toast) => toast.title)).toEqual(["Copied models.yaml"]);
  });

  it("opens the file in a new tab when Open in new tab is picked", async () => {
    const { page, openItemInNewTab } = await show();
    await rightClick(rowNamed(page, "models.yaml"));
    await pick("Open in new tab");

    expect(openItemInNewTab).toHaveBeenCalledWith({
      kind: "file",
      hub: "workspace",
      id: "models.yaml",
    });
  });

  it("opens the menu from the row's ⋮ button, which names its file", async () => {
    const { page } = await show();
    const button = rowNamed(page, "models.yaml").querySelector<HTMLElement>(
      'button[aria-label="More actions for models.yaml"]',
    );
    expect(button).not.toBeNull();
    await act(async () => button?.click());

    expect(menuItems()).toHaveLength(5);
  });
});
