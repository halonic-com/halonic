// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fileItem } from "../file-item.ts";
import type { FilesHost } from "../files-host.ts";
import { takeRenameAsked } from "../rename-request.ts";
import { forgetOpenedEditors, openedEditors } from "../test-support/code-editor.ts";
import { codePane, openFolders, showCodePage } from "../test-support/code-page.tsx";
import { unmountAll } from "../test-support/render.tsx";
import { listing, rowNamed, settled } from "../test-support/sidebar.ts";

// The real editor is tested in its own package; here a stand-in lets the pane draw.
vi.mock("@halonicjs/studio-code-editor", () => import("../test-support/code-editor.ts"));

afterEach(() => {
  unmountAll();
  forgetOpenedEditors();
  takeRenameAsked();
});

const acmeFiles = ["src/checkout/orders.ts", "src/checkout/refunds.ts", "README.md"];

/** A workspace with an error in `refunds.ts`, or with no problems at all. */
function withProblems(problems: boolean) {
  const marks = new Map(problems ? [["src/checkout/refunds.ts", { errors: 1 }]] : []);
  return { host: { list: async () => listing(acmeFiles, marks) } };
}

/** The chip with the label, by its radio. */
function chip(page: HTMLElement, label: string): HTMLInputElement {
  const found = [...page.querySelectorAll<HTMLLabelElement>('[role="radiogroup"] label')].find(
    (item) => item.textContent === label,
  );
  const radio = found?.querySelector<HTMLInputElement>('input[type="radio"]');
  if (radio == null) throw new Error(`no chip ${label}`);
  return radio;
}

async function pick(page: HTMLElement, label: string): Promise<void> {
  act(() => chip(page, label).click());
  await settled();
}

async function openInPane(page: HTMLElement, path: string): Promise<void> {
  act(() => rowNamed(page, path).click());
  await settled();
}

async function pressF2InPane(page: HTMLElement): Promise<void> {
  const file = codePane(page, "content")?.querySelector("section");
  await act(async () => {
    file?.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
  });
  await settled();
}

/** Types into a field as a person does, so React hears the change. */
async function typeInto(input: HTMLInputElement | null, value: string): Promise<void> {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settled();
}

async function key(target: Element | null, name: string): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
  await settled();
}

function shownPaths(page: HTMLElement): string[] {
  return [...page.querySelectorAll<HTMLElement>("[data-path]")].map(
    (row) => row.dataset["path"] ?? "",
  );
}

verifies("files.code-list-chips", () => {
  it("shows All and Problems under the search field, with All on", async () => {
    const { page } = await showCodePage(withProblems(true));
    const chips = codePane(page, "list")?.querySelector('[role="radiogroup"]');

    expect(chips?.getAttribute("aria-label")).toBe("Show");
    expect(chip(page, "All").checked).toBe(true);
    expect(chip(page, "Problems").checked).toBe(false);
  });

  it("lists only the files with a problem while Problems is on", async () => {
    const { page } = await showCodePage(withProblems(true));
    await pick(page, "Problems");
    await openFolders(page, "src", "src/checkout");

    expect(shownPaths(page)).toEqual(["src", "src/checkout", "src/checkout/refunds.ts"]);
  });

  it("says no file has a problem in place of the tree", async () => {
    const { page } = await showCodePage(withProblems(false));
    await pick(page, "Problems");

    expect(codePane(page, "list")?.querySelector('[role="tree"]')).toBeNull();
    expect(codePane(page, "list")?.textContent).toContain("No file has a problem.");
  });

  it("searches among the files with a problem while Problems is on", async () => {
    const { page } = await showCodePage(withProblems(true));
    await pick(page, "Problems");
    const search = page.querySelector<HTMLInputElement>('input[type="search"]');

    await typeInto(search, "orders");
    expect(codePane(page, "list")?.textContent).toContain("No files match “orders”.");

    await typeInto(search, "checkout");
    expect(codePane(page, "list")?.textContent).toContain("1 file");
    expect(shownPaths(page)).toEqual(["src", "src/checkout", "src/checkout/refunds.ts"]);
  });

  it("turns All on after a rename in the tree, so the row takes the focus without a problem", async () => {
    let paths = acmeFiles;
    let marks = new Map([["src/checkout/refunds.ts", { errors: 1 }]]);
    const subscribers: (() => void)[] = [];
    const host: Partial<FilesHost> = {
      list: async () => listing(paths, marks),
      subscribe: (listener) => {
        subscribers.push(listener);
        return () => {};
      },
      rename: async () => {
        paths = ["src/checkout/orders.ts", "src/checkout/refund.ts", "README.md"];
        marks = new Map();
        return { places: 0, owners: [], undo: async () => {} };
      },
    };
    const { page } = await showCodePage({ host });
    await pick(page, "Problems");
    await openFolders(page, "src", "src/checkout");
    // The click gives the row the tree's focus, and F2 renames the focused row.
    await openInPane(page, "src/checkout/refunds.ts");
    await key(rowNamed(page, "src/checkout/refunds.ts"), "F2");

    const field = rowNamed(page, "src/checkout/refunds.ts").querySelector("input");
    await typeInto(field, "refund.ts");
    await key(field, "Enter");
    await act(async () => {
      for (const listener of subscribers) listener();
    });
    await settled();

    expect(chip(page, "All").checked).toBe(true);
    expect(document.activeElement).toBe(rowNamed(page, "src/checkout/refund.ts"));
  });

  it("moves Go to Files to the line that says no file has a problem", async () => {
    const { page } = await showCodePage({
      host: { ...withProblems(false).host, read: async () => null },
    });
    await openInPane(page, "README.md");
    await pick(page, "Problems");

    const goTo = [...page.querySelectorAll("button")].find(
      (button) => button.textContent === "Go to Files",
    );
    act(() => goTo?.click());

    expect(document.activeElement?.textContent).toBe("No file has a problem.");
  });

  it("turns All on for F2 in the pane, so the row's name field shows", async () => {
    const { page } = await showCodePage(withProblems(true));
    await openInPane(page, "README.md");
    await pick(page, "Problems");

    await pressF2InPane(page);

    expect(chip(page, "All").checked).toBe(true);
    expect(rowNamed(page, "README.md").querySelector("input")).not.toBeNull();
  });
});

verifies("files.code-pane-header", () => {
  it("heads the pane's file with its tile, its name at level 2 and its folder", async () => {
    const { page } = await showCodePage();
    await openFolders(page, "src", "src/checkout");
    await openInPane(page, "src/checkout/orders.ts");

    const header = codePane(page, "content")?.querySelector("header");
    expect(header?.className.split(" ")).toEqual(
      expect.arrayContaining(["h-16", "border-b", "border-border"]),
    );
    expect(header?.querySelector('[aria-hidden="true"].size-10.rounded-md svg')).not.toBeNull();
    expect(header?.querySelector("h2")?.textContent).toBe("orders.ts");
    expect(header?.querySelector("p")?.textContent).toBe("src/checkout");
    expect(header?.querySelector('[aria-label="More actions for orders.ts"]')).not.toBeNull();
  });

  it("shows no folder line for a file at the top", async () => {
    const { page } = await showCodePage();
    await openInPane(page, "README.md");

    expect(codePane(page, "content")?.querySelector("header p")).toBeNull();
  });
});

verifies("files.tree.keyboard", () => {
  it("shows the file Enter is pressed on in Code's content pane", async () => {
    const { page, opened } = await showCodePage();
    const tree = codePane(page, "list")?.querySelector('[role="tree"]');
    // End moves the focus to the last row, `README.md`, and Enter opens it.
    act(() => {
      tree?.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    act(() => {
      rowNamed(page, "README.md").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await settled();

    expect(codePane(page, "content")?.querySelector("h2")?.textContent).toBe("README.md");
    expect(openedEditors.at(-1)?.text).toBe("// README.md\n");
    expect(opened).toEqual([]);
  });
});

verifies("files.ui.file-tab-header", () => {
  it("edits the name in Code's list column on F2 in Code's pane, and leaves the sidebar", async () => {
    const { page, sidebar, shownViews } = await showCodePage({ withSidebar: true });
    await openInPane(page, "README.md");

    await pressF2InPane(page);

    expect(rowNamed(page, "README.md").querySelector("input")).not.toBeNull();
    expect(sidebar?.querySelector('input:not([type="search"])')).toBeNull();
    expect(shownViews).toEqual([]);
  });
});

verifies("files.ui.file-tab", () => {
  it("opens a file Ctrl-clicked in the sidebar's tree in a new tab", async () => {
    const { sidebar, opened, openedInNewTab } = await showCodePage({ withSidebar: true });
    if (sidebar === null) throw new Error("no sidebar");

    act(() => {
      rowNamed(sidebar, "README.md").dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      );
    });

    expect(openedInNewTab).toEqual([fileItem("README.md")]);
    expect(opened).toEqual([]);
  });
});
