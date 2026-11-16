// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { LibraryItemsHost } from "../library-items-host.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { LibraryPage } from "./library-page.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restorePopover();
});

const nobody = { agents: [], hubs: [], routines: [], collections: [] };

/** A host whose list changes with each delete and Undo, and tells the page, as the real one does. `changed` tells it without a change. */
function changingHost(names: readonly string[]) {
  let present = [...names];
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const listener of listeners) listener();
  };
  const host: LibraryItemsHost = {
    list: async () => ({
      hubs: [],
      shared: {
        workspaceName: "Acme",
        entries: present.map((name) => ({ id: name.toLowerCase(), name, usage: nobody })),
      },
    }),
    remove: async (_kind, place) => {
      const before = [...present];
      present = present.filter((name) => name.toLowerCase() !== place.id);
      tell();
      return {
        undo: async () => {
          present = before;
          tell();
        },
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { ...host, changed: tell };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function showLibrary(host: LibraryItemsHost) {
  const toasts = createToastStore();
  const page = render(
    <ToastStoreProvider store={toasts}>
      <LibraryPage
        host={host}
        kind="skill"
        onKindChange={() => undefined}
        onOpen={() => undefined}
        onOpenInNewTab={() => undefined}
      />
    </ToastStoreProvider>,
  );
  await settled();
  return { page, toasts };
}

async function deleteRow(root: ParentNode, name: string): Promise<void> {
  act(() =>
    root.querySelector<HTMLElement>(`button[aria-label="More actions for ${name}"]`)?.click(),
  );
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (each) => each.textContent === "Delete",
  );
  await act(async () => item?.click());
  await settled();
}

/** Types into the search field, as a person would. */
function search(root: ParentNode, text: string): void {
  const field = root.querySelector<HTMLInputElement>('input[type="search"]');
  if (field === null) throw new Error("no search field");
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The name of the row that holds focus. */
function focusedRow(): string | undefined {
  return (
    document.activeElement?.closest("tr")?.querySelector("[role=gridcell]")?.textContent ??
    undefined
  );
}

verifies("library.library-delete", () => {
  it("focuses the next row after a delete", async () => {
    const { page } = await showLibrary(changingHost(["Alpha", "Beta", "Gamma"]));
    await deleteRow(page, "Beta");
    expect(focusedRow()).toContain("Gamma");
  });

  it("focuses the previous row when the last row was deleted", async () => {
    const { page } = await showLibrary(changingHost(["Alpha", "Beta", "Gamma"]));
    await deleteRow(page, "Gamma");
    expect(focusedRow()).toContain("Beta");
  });

  it("focuses the empty state when the only row was deleted", async () => {
    const { page } = await showLibrary(changingHost(["Alpha"]));
    await deleteRow(page, "Alpha");
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.textContent).toBe("No skills yet");
  });

  it("focuses the restored row after Undo", async () => {
    const { page, toasts } = await showLibrary(changingHost(["Alpha", "Beta", "Gamma"]));
    await deleteRow(page, "Beta");
    await act(async () => toasts.list()[0]?.action?.onClick());
    await settled();
    expect(focusedRow()).toContain("Beta");
  });

  it("focuses the no-match message when the only row that matches the search was deleted", async () => {
    const { page } = await showLibrary(changingHost(["Alpha", "Beta"]));
    search(page, "alp");
    await deleteRow(page, "Alpha");
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.activeElement?.textContent).toContain("No skills match");
  });

  it("drops the focus on a restored row that the search hides", async () => {
    const host = changingHost(["Alpha", "Beta"]);
    const { page, toasts } = await showLibrary(host);
    search(page, "alp");
    await deleteRow(page, "Alpha");
    search(page, "bet");
    await act(async () => toasts.list()[0]?.action?.onClick());
    await settled();
    search(page, "");
    host.changed();
    await settled();
    expect(page.textContent).toContain("Alpha");
    expect(focusedRow()).toBeUndefined();
  });
});
