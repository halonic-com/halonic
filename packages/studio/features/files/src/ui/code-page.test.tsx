// @vitest-environment jsdom
import { listColumnClass } from "@halonicjs/studio-kit/list-column";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fileItem } from "../file-item.ts";
import { forgetOpenedEditors, openedEditors } from "../test-support/code-editor.ts";
import { codePane, openFolders, showCodePage } from "../test-support/code-page.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { rowNamed, settled } from "../test-support/sidebar.ts";

// The real editor is tested in its own package; here a stand-in lets the pane draw.
vi.mock("@halonicjs/studio-code-editor", () => import("../test-support/code-editor.ts"));

afterEach(() => {
  unmountAll();
  forgetOpenedEditors();
});

verifies("files.code-page", () => {
  it("puts the tree under Code in the kit's list column, and says no file is open", async () => {
    const { page } = await showCodePage();
    const list = codePane(page, "list");

    expect(list?.querySelector("h1")?.textContent).toBe("Code");
    expect(list?.querySelector('[role="tree"]')).not.toBeNull();
    expect(list?.className.split(" ")).toEqual(
      expect.arrayContaining([...listColumnClass.split(" "), "shrink-0", "overflow-y-auto"]),
    );
    const content = codePane(page, "content");
    expect(content?.className.split(" ")).toContain("flex-1");
    expect(content?.tagName).toBe("SECTION");
    expect(content?.getAttribute("aria-label")).toBe("No file open");
    expect(content?.querySelector("h2")?.textContent).toBe("No file open");
    expect(content?.textContent).toContain("Pick a file in the list to open it.");
  });

  it("keeps the Code title while the tree loads and when it can't load", async () => {
    const loading = await showCodePage({
      host: { list: () => new Promise(() => {}) },
      unsettled: true,
    });
    expect(codePane(loading.page, "list")?.querySelector("h1")?.textContent).toBe("Code");

    const failing = await showCodePage({
      host: { list: async () => Promise.reject(new Error("no")) },
    });
    const list = codePane(failing.page, "list");
    expect(list?.querySelector("h1")?.textContent).toBe("Code");
    expect(list?.textContent).toContain("Couldn't load files");
  });

  it("shows a clicked file in the pane in place of the last one, and keeps the tab", async () => {
    const { page, opened } = await showCodePage();
    await openFolders(page, "src", "src/checkout");

    act(() => rowNamed(page, "src/checkout/refunds.ts").click());
    await settled();
    act(() => rowNamed(page, "src/checkout/orders.ts").click());
    await settled();

    const content = codePane(page, "content");
    // The file's own section names the pane, so there is one region named `orders.ts`.
    expect(content?.hasAttribute("aria-label")).toBe(false);
    expect(page.querySelectorAll('section[aria-label="orders.ts"]')).toHaveLength(1);
    expect(content?.querySelector("h2")?.textContent).toBe("orders.ts");
    expect(openedEditors.at(-1)?.text).toBe("// src/checkout/orders.ts\n");
    expect(openedEditors.filter((editor) => !editor.destroyed)).toHaveLength(1);
    expect(rowNamed(page, "src/checkout/orders.ts").getAttribute("aria-selected")).toBe("true");
    expect(rowNamed(page, "src/checkout/refunds.ts").getAttribute("aria-selected")).toBe("false");
    expect(opened).toEqual([]);
  });

  it("opens a Ctrl-clicked, Cmd-clicked or middle-clicked file in a new tab and leaves the pane", async () => {
    const { page, openedInNewTab } = await showCodePage();
    const readme = rowNamed(page, "README.md");

    act(() => {
      readme.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    });
    act(() => {
      readme.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
    });
    act(() => {
      readme.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    });
    await settled();

    expect(openedInNewTab).toEqual([
      fileItem("README.md"),
      fileItem("README.md"),
      fileItem("README.md"),
    ]);
    expect(codePane(page, "content")?.getAttribute("aria-label")).toBe("No file open");
  });

  it("shows the tree alone on a phone, where a file opens as its own page", async () => {
    const { page, opened } = await showCodePage({ presentation: "phone" });

    expect(codePane(page, "list")).toBeNull();
    expect(codePane(page, "content")).toBeNull();
    act(() => rowNamed(page, "README.md").click());

    expect(opened).toEqual([fileItem("README.md")]);
  });
});
