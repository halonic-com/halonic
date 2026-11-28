// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import type { ItemRef, ItemViewProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { codePageItem } from "../code-page.ts";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { forgetOpenedEditors, openedEditors } from "../test-support/code-editor.ts";
import { filesLookup } from "../test-support/lookup.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost, listing, rowNamed, settled } from "../test-support/sidebar.ts";
import { CodePage } from "./code-page.tsx";

// The real editor is tested in its own package; here a stand-in lets the pane draw.
vi.mock("@halonicjs/studio-code-editor", () => import("../test-support/code-editor.ts"));

afterEach(() => {
  unmountAll();
  forgetOpenedEditors();
});

function NoSections() {
  return null;
}

async function show(presentation: "desktop" | "phone" = "desktop") {
  const opened: ItemRef[] = [];
  const openedInNewTab: ItemRef[] = [];
  const host: FilesHost = {
    ...contextHost(),
    list: async () => listing(["src/checkout/orders.ts", "src/checkout/refunds.ts", "README.md"]),
    read: async (path) => `// ${path}\n`,
  };
  const context = {
    services: filesLookup(host),
    announcer: { announce: () => {} },
    openItem: (item: ItemRef) => opened.push(item),
    openItemInNewTab: (item: ItemRef) => openedInNewTab.push(item),
  } as unknown as WorkspaceContext;
  const props: ItemViewProps = { item: codePageItem, context, Sections: NoSections };
  const page = render(
    <PresentationProvider presentation={presentation}>
      <CodePage {...props} />
    </PresentationProvider>,
  );
  await settled();
  return { page, opened, openedInNewTab };
}

function pane(page: HTMLElement, name: "list" | "content"): HTMLElement | null {
  return page.querySelector<HTMLElement>(`[data-pane="${name}"]`);
}

async function openFolders(page: HTMLElement, ...paths: string[]) {
  for (const path of paths) act(() => rowNamed(page, path).click());
  await settled();
}

verifies("files.code-page", () => {
  it("puts the tree under Code in the kit's list column, and says no file is open", async () => {
    const { page } = await show();
    const list = pane(page, "list");

    expect(list?.querySelector("h1")?.textContent).toBe("Code");
    expect(list?.querySelector('[role="tree"]')).not.toBeNull();
    expect(list?.className.split(" ")).toEqual(
      expect.arrayContaining([...listColumnClass.split(" "), "shrink-0", "overflow-y-auto"]),
    );
    const content = pane(page, "content");
    expect(content?.className.split(" ")).toContain("flex-1");
    expect(content?.getAttribute("aria-label")).toBe("No file open");
    expect(content?.querySelector("h2")?.textContent).toBe("No file open");
    expect(content?.textContent).toContain("Pick a file in the list to open it.");
  });

  it("shows a clicked file in the pane in place of the last one, and keeps the tab", async () => {
    const { page, opened } = await show();
    await openFolders(page, "src", "src/checkout");

    act(() => rowNamed(page, "src/checkout/refunds.ts").click());
    await settled();
    act(() => rowNamed(page, "src/checkout/orders.ts").click());
    await settled();

    const content = pane(page, "content");
    expect(content?.getAttribute("aria-label")).toBe("orders.ts");
    expect(content?.querySelector("h1")?.textContent).toBe("orders.ts");
    expect(openedEditors.at(-1)?.text).toBe("// src/checkout/orders.ts\n");
    expect(openedEditors.filter((editor) => !editor.destroyed)).toHaveLength(1);
    expect(rowNamed(page, "src/checkout/orders.ts").getAttribute("aria-selected")).toBe("true");
    expect(rowNamed(page, "src/checkout/refunds.ts").getAttribute("aria-selected")).toBe("false");
    expect(opened).toEqual([]);
  });

  it("opens a Ctrl-clicked or middle-clicked file in a new tab and leaves the pane", async () => {
    const { page, openedInNewTab } = await show();
    const readme = rowNamed(page, "README.md");

    act(() => {
      readme.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    });
    act(() => {
      readme.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    });
    await settled();

    expect(openedInNewTab).toEqual([fileItem("README.md"), fileItem("README.md")]);
    expect(pane(page, "content")?.getAttribute("aria-label")).toBe("No file open");
  });

  it("shows the tree alone on a phone, where a file opens as its own page", async () => {
    const { page, opened } = await show("phone");

    expect(pane(page, "list")).toBeNull();
    expect(pane(page, "content")).toBeNull();
    act(() => rowNamed(page, "README.md").click());

    expect(opened).toEqual([fileItem("README.md")]);
  });
});
