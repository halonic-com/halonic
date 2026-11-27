// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { FilesHost } from "../files-host.ts";
import { requestFilesReveal, takeFilesRevealRequests } from "../reveal-request.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost, contextOf, listing, rowNamed, settled } from "../test-support/sidebar.ts";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

afterEach(() => {
  unmountAll();
  // A request no view took must not reach the next test's view.
  takeFilesRevealRequests(() => "shown")();
});

const acme = [
  "docs/guide.md",
  "src/checkout/cart.ts",
  "src/checkout/totals.ts",
  "tests/subtotal.test.ts",
];

function hostOf(paths: string[]): FilesHost {
  return { ...contextHost(), list: async () => listing(paths) };
}

async function show(paths: string[] = acme): Promise<HTMLElement> {
  const page = render(<FilesSidebarView context={contextOf(hostOf(paths))} />);
  await settled();
  return page;
}

function field(page: HTMLElement): HTMLInputElement {
  const input = page.querySelector<HTMLInputElement>('input[type="search"]');
  if (input === null) throw new Error("no search field");
  return input;
}

async function type(page: HTMLElement, value: string): Promise<void> {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(field(page), value);
    field(page).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function shownPaths(page: HTMLElement): (string | null)[] {
  return [...page.querySelectorAll('[role="treeitem"]')].map((row) =>
    row.getAttribute("data-path"),
  );
}

function status(page: HTMLElement): string | null | undefined {
  return page.querySelector('[role="status"]')?.textContent;
}

verifies("files.ui.tree-search", () => {
  it("shows a search field named Search files above the tree", async () => {
    const page = await show();
    expect(field(page).getAttribute("aria-label")).toBe("Search files");
    const tree = page.querySelector('[role="tree"]');
    expect(tree).not.toBeNull();
    expect(
      field(page).compareDocumentPosition(tree as Element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(status(page)).toBe("");
  });

  it("shows only the matching files, under their folders, open, with the count", async () => {
    const page = await show();
    await type(page, "Total");
    expect(shownPaths(page)).toEqual([
      "src",
      "src/checkout",
      "src/checkout/totals.ts",
      "tests",
      "tests/subtotal.test.ts",
    ]);
    expect(rowNamed(page, "src/checkout").getAttribute("aria-expanded")).toBe("true");
    expect(status(page)).toBe("2 files");
  });

  it("says 1 file for one match", async () => {
    const page = await show();
    await type(page, "cart");
    expect(status(page)).toBe("1 file");
  });

  it("says no files match in place of the tree", async () => {
    const page = await show();
    await type(page, " invoice ");
    expect(page.querySelector('[role="tree"]')).toBeNull();
    expect(status(page)).toBe(
      "No files match “invoice”Check the spelling, or search for part of the name.",
    );
  });

  it("shows the whole tree as it was once the field is emptied with Escape", async () => {
    const page = await show();
    act(() => rowNamed(page, "docs").click());
    await type(page, "total");
    expect(page.querySelector('[data-path="docs"]')).toBeNull();
    const pressed = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      field(page).dispatchEvent(pressed);
    });
    expect(pressed.defaultPrevented).toBe(true);
    expect(field(page).value).toBe("");
    expect(shownPaths(page)).toEqual(["docs", "docs/guide.md", "src", "tests"]);
    expect(status(page)).toBe("");
  });

  it("leaves Escape to the page while the field is empty", async () => {
    const page = await show();
    const pressed = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      field(page).dispatchEvent(pressed);
    });
    expect(pressed.defaultPrevented).toBe(false);
  });

  it("keeps a folder closed during the search until the text changes", async () => {
    const page = await show();
    await type(page, "total");
    act(() => rowNamed(page, "tests").click());
    expect(rowNamed(page, "tests").getAttribute("aria-expanded")).toBe("false");
    expect(page.querySelector('[data-path="tests/subtotal.test.ts"]')).toBeNull();
    await type(page, "totals");
    await type(page, "total");
    expect(rowNamed(page, "tests").getAttribute("aria-expanded")).toBe("true");
  });

  it("empties the field when another feature asks to show a path", async () => {
    const page = await show();
    await type(page, "invoice");
    let answer: Promise<unknown> | undefined;
    await act(async () => {
      answer = requestFilesReveal("docs/guide.md");
    });
    await settled();
    expect(await answer).toBe("shown");
    expect(field(page).value).toBe("");
    expect(rowNamed(page, "docs/guide.md")).not.toBeNull();
  });
});

verifies("files.ui.tree-rows", () => {
  it("draws rows 36px high with 8px corners, 10px inside the column, 16px in per level", async () => {
    const page = await show(["src/index.ts"]);
    act(() => rowNamed(page, "src").click());
    const classes = rowNamed(page, "src").className.split(" ");
    expect(classes).toContain("min-h-9");
    expect(classes).toContain("rounded-sm");
    expect(page.querySelector('[role="tree"]')?.className.split(" ")).toContain("px-2.5");
    expect(rowNamed(page, "src").style.paddingLeft).toBe("8px");
    expect(rowNamed(page, "src/index.ts").style.paddingLeft).toBe("24px");
  });

  it("gives the hovered row and the open file's row one fill, and the open file medium weight", async () => {
    const page = await show(["models.yaml"]);
    const classes = rowNamed(page, "models.yaml").className.split(" ");
    expect(classes).toContain("hover:bg-surface-muted");
    expect(classes).toContain("aria-selected:bg-surface-muted");
    expect(classes).toContain("aria-selected:text-body-strong");
    expect(classes).not.toContain("aria-selected:bg-accent-soft");
  });
});
