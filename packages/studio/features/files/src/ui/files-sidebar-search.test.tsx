// @vitest-environment jsdom
import { type ToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FilesHost } from "../files-host.ts";
import { askRename, takeRenameAsked } from "../rename-request.ts";
import { requestFilesReveal, takeFilesRevealRequests } from "../reveal-request.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { contextHost, contextOf, listing, rowNamed, settled } from "../test-support/sidebar.ts";
import { forgetAllTrashed } from "../trash.ts";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

afterEach(() => {
  unmountAll();
  // A request no view took must not reach the next test's view.
  takeFilesRevealRequests(() => "shown")();
  takeRenameAsked();
  forgetAllTrashed();
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

async function typeInto(input: HTMLInputElement | null, value: string): Promise<void> {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const type = (page: HTMLElement, value: string) => typeInto(field(page), value);

async function key(target: Element | null, name: string): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
  await settled();
}

/** The view over a folder that changes: a rename or a delete is listed again, and Undo puts it back. */
async function showLive(toasts?: ToastStore): Promise<{ page: HTMLElement }> {
  let paths = acme;
  let notify = () => {};
  const change = (next: string[]) => {
    const before = paths;
    paths = next;
    notify();
    return async () => {
      paths = before;
      notify();
    };
  };
  const host: FilesHost = {
    ...contextHost(),
    list: async () => listing(paths),
    subscribe: (listener) => {
      notify = listener;
      return () => {};
    },
    rename: async (from, to) => {
      const undo = change(paths.map((path) => (path === from ? to : path)));
      return { places: 0, owners: [], undo };
    },
    remove: async (path) => {
      const undo = change(paths.filter((other) => other !== path));
      return { places: 0, undo };
    },
  };
  const view = <FilesSidebarView context={contextOf(host)} />;
  const page = render(
    toasts === undefined ? view : <ToastStoreProvider store={toasts}>{view}</ToastStoreProvider>,
  );
  await settled();
  return { page };
}

/** Renames the search result `totals.ts` in its row, with Enter. */
async function renameTotals(page: HTMLElement, name: string): Promise<void> {
  const row = rowNamed(page, "src/checkout/totals.ts");
  act(() => row.click());
  await key(row, "F2");
  const input = row.querySelector<HTMLInputElement>('input:not([type="search"])');
  await typeInto(input, name);
  await key(input, "Enter");
}

function pressEscape(page: HTMLElement): KeyboardEvent {
  const pressed = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    field(page).dispatchEvent(pressed);
  });
  return pressed;
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
      "No files match “invoice”.Check the spelling, or search for part of the name.",
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

  it("leaves the folders opened before the search alone when one is closed during it", async () => {
    const page = await show();
    act(() => rowNamed(page, "docs").click());
    await type(page, "total");
    act(() => rowNamed(page, "tests").click());
    pressEscape(page);
    expect(shownPaths(page)).toEqual(["docs", "docs/guide.md", "src", "tests"]);
    expect(rowNamed(page, "docs").getAttribute("aria-expanded")).toBe("true");
    expect(rowNamed(page, "src").getAttribute("aria-expanded")).toBe("false");
    expect(rowNamed(page, "tests").getAttribute("aria-expanded")).toBe("false");
  });

  it("moves focus to the next row the search shows after Delete on a result", async () => {
    const { page } = await showLive();
    await type(page, "total");
    const row = rowNamed(page, "src/checkout/totals.ts");
    act(() => row.click());
    await key(row, "Delete");
    expect(shownPaths(page)).toEqual(["tests", "tests/subtotal.test.ts"]);
    expect(document.activeElement).toBe(rowNamed(page, "tests"));
  });

  it("ends the search when a result is renamed to a name the search doesn't hold", async () => {
    const { page } = await showLive();
    await type(page, "total");
    await renameTotals(page, "sum.ts");
    expect(field(page).value).toBe("");
    expect(document.activeElement).toBe(rowNamed(page, "src/checkout/sum.ts"));
    // The focus was given once: typing in the field later doesn't lose the caret to the row.
    act(() => field(page).focus());
    await type(page, "c");
    await settled();
    expect(document.activeElement).toBe(field(page));
  });

  it("keeps the search when a renamed result still matches it", async () => {
    const { page } = await showLive();
    await type(page, "total");
    await renameTotals(page, "totals-2.ts");
    expect(field(page).value).toBe("total");
    expect(document.activeElement).toBe(rowNamed(page, "src/checkout/totals-2.ts"));
  });

  it("ends the search when Undo gives a renamed file back a name the search doesn't hold", async () => {
    const toasts = { show: vi.fn() };
    const { page } = await showLive(toasts as unknown as ToastStore);
    await type(page, "total");
    await renameTotals(page, "totals-2.ts");
    await type(page, "s-2");
    await act(async () => {
      toasts.show.mock.calls[0]?.[0].action.onClick();
    });
    await settled();
    expect(field(page).value).toBe("");
    expect(document.activeElement).toBe(rowNamed(page, "src/checkout/totals.ts"));
  });

  it("ends the search when Undo brings back a deleted file the search doesn't show", async () => {
    const toasts = { show: vi.fn() };
    const { page } = await showLive(toasts as unknown as ToastStore);
    await type(page, "total");
    const row = rowNamed(page, "src/checkout/totals.ts");
    act(() => row.click());
    await key(row, "Delete");
    await type(page, "cart");
    await act(async () => {
      toasts.show.mock.calls[0]?.[0].action.onClick();
    });
    await settled();
    expect(field(page).value).toBe("");
    expect(document.activeElement).toBe(rowNamed(page, "src/checkout/totals.ts"));
  });

  const nameField = (page: HTMLElement, path: string) =>
    rowNamed(page, path).querySelector<HTMLInputElement>('input:not([type="search"])');

  it("empties the field when a file's tab asks to rename a file the search hides", async () => {
    const page = await show();
    act(() => rowNamed(page, "docs").click());
    await type(page, "total");
    await act(async () => askRename("docs/guide.md"));
    expect(field(page).value).toBe("");
    expect(nameField(page, "docs/guide.md")?.value).toBe("guide.md");
  });

  it("opens the folders above a file a tab asks to rename, when only the search showed its row", async () => {
    const page = await show();
    await type(page, "total");
    await act(async () => askRename("src/checkout/totals.ts"));
    expect(field(page).value).toBe("");
    expect(shownPaths(page)).toEqual([
      "docs",
      "src",
      "src/checkout",
      "src/checkout/cart.ts",
      "src/checkout/totals.ts",
      "tests",
    ]);
    expect(nameField(page, "src/checkout/totals.ts")?.value).toBe("totals.ts");
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
  it("draws rows 32px high with 8px corners, 10px inside the column, 13px in and 16px more per level", async () => {
    const page = await show(["src/index.ts"]);
    act(() => rowNamed(page, "src").click());
    const classes = rowNamed(page, "src").className.split(" ");
    expect(classes).toContain("min-h-control-md");
    expect(classes).toContain("rounded-sm");
    expect(page.querySelector('[role="tree"]')?.className.split(" ")).toContain("px-2.5");
    expect(rowNamed(page, "src").style.paddingLeft).toBe("13px");
    expect(rowNamed(page, "src/index.ts").style.paddingLeft).toBe("29px");
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
