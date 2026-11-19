// @vitest-environment jsdom
import type { CodeEditorOptions } from "@halonicjs/studio-code-editor";
import {
  ClipboardProvider,
  createToastStore,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { type ItemRef, limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { takeRenameAsked } from "../rename-request.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost } from "../test-support/sidebar.ts";
import { FileView } from "./file-view.tsx";

// The real editor is tested in its own package; here a stand-in lets the tab draw.
vi.mock("@halonicjs/studio-code-editor", () => ({
  languageFor: () => "yaml",
  openCodeEditor: async (options: CodeEditorOptions) => ({
    text: () => options.text,
    load: () => {},
    focus: () => {},
    setProblems: () => {},
    goTo: () => {},
    destroy: () => {},
  }),
}));

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restorePopover();
  takeRenameAsked();
});

async function showFile(path: string, host: FilesHost = contextHost()) {
  const written: string[] = [];
  const shownViews: string[] = [];
  const opened: ItemRef[] = [];
  const toasts: ToastStore = createToastStore();
  // One host for the whole render: a new object on each read would restart the tab's effects.
  const readable: FilesHost = { ...host, read: async () => "name: a\n" };
  const context = {
    services: limitedLookup(filesFeature, {
      get: () => readable,
    }),
    announcer: { announce: () => {} },
    showSidebarView: (viewId: string) => shownViews.push(viewId),
    openItem: (item: ItemRef) => opened.push(item),
  } as unknown as WorkspaceContext;
  const page = render(
    <ClipboardProvider
      writeClipboard={async (text) => {
        written.push(text);
        return true;
      }}
    >
      <ToastStoreProvider store={toasts}>
        <FileView item={fileItem(path)} context={context} Sections={() => null} />
      </ToastStoreProvider>
    </ClipboardProvider>,
  );
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return { page, written, toasts, shownViews, opened };
}

const pick = async (label: string) => {
  const item = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find((each) =>
    each.textContent?.startsWith(label),
  );
  await act(async () => item?.click());
};

verifies("files.ui.file-tab-header", () => {
  it("shows the name, then the folder in muted text", async () => {
    const { page } = await showFile("hubs/p/agents/a.agent.yaml");

    expect(page.querySelector("h1")?.textContent).toBe("a.agent.yaml");
    expect(page.querySelector("header")?.textContent).toContain("hubs/p/agents");
  });

  it("shows no folder for a file at the top of the workspace", async () => {
    const { page } = await showFile("models.yaml");

    expect(page.querySelector("header > .text-fg-muted")).toBeNull();
  });

  it("has a ⋮ menu with Rename, Copy path and Delete", async () => {
    const { page } = await showFile("models.yaml");
    const trigger = page.querySelector('button[aria-label="More actions for models.yaml"]');

    expect(trigger).not.toBeNull();
    expect(
      [...document.querySelectorAll("[role=menuitem]")].map((item) => item.textContent),
    ).toEqual(["RenameF2", "Copy path", "DeleteDelete"]);
  });

  it("starts the menu with Open as agent for an agent's file, which opens the agent", async () => {
    const { opened } = await showFile("hubs/p/agents/sorter.agent.yaml");

    expect(
      [...document.querySelectorAll("[role=menuitem]")].map((item) => item.textContent),
    ).toEqual(["Open as agent", "RenameF2", "Copy path", "DeleteDelete"]);
    await pick("Open as agent");
    expect(opened).toEqual([{ kind: "agent", hub: "p", id: "sorter" }]);
  });

  it("asks the tree to rename the file on Rename and on F2, and shows the tree", async () => {
    const { page, shownViews } = await showFile("hubs/a.yaml");
    await pick("Rename");
    expect(takeRenameAsked()).toBe("hubs/a.yaml");
    expect(shownViews).toEqual(["files"]);

    await act(async () => {
      page
        .querySelector("section")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    expect(takeRenameAsked()).toBe("hubs/a.yaml");
    expect(shownViews).toEqual(["files", "files"]);
  });

  it("copies the path and says so", async () => {
    const { written, toasts } = await showFile("hubs/a.yaml");
    await pick("Copy path");

    expect(written).toEqual(["hubs/a.yaml"]);
    expect(toasts.list().map((toast) => toast.title)).toEqual(["Copied hubs/a.yaml"]);
  });

  it("moves the file to the trash on Delete", async () => {
    const remove = vi.fn(async () => ({ places: 0, undo: async () => {} }));
    await showFile("hubs/a.yaml", { ...contextHost(), remove });
    await pick("Delete");

    expect(remove).toHaveBeenCalledWith("hubs/a.yaml");
  });
});
