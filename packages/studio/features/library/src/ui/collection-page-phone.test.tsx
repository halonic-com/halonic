// @vitest-environment jsdom
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { type ItemViewProps, limitedLookup, PhoneTopBarSlot } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionHostService } from "../collection-host.ts";
import { libraryFeature } from "../feature.ts";
import { type LibraryItemsHost, LibraryItemsHostService } from "../library-items-host.ts";
import { cleanUp, settled, setup, sourceOf, swim } from "../test-support/collection-page.tsx";
import { installFakePopover } from "../test-support/popover.ts";
import { render } from "../test-support/render.tsx";
import { CollectionPage } from "./collection-page.tsx";

let restorePopover: () => void;
let topBar: HTMLElement;
beforeEach(() => {
  restorePopover = installFakePopover();
  topBar = document.createElement("div");
  document.body.append(topBar);
});
afterEach(() => {
  cleanUp();
  restorePopover();
  topBar.remove();
});

const items: LibraryItemsHost = {
  list: async () => ({ hubs: [], shared: { workspaceName: "Acme", entries: [] } }),
  remove: async () => ({ undo: async () => {} }),
  readFile: async () => "",
  subscribe: () => () => {},
};

/** The collection page's props, with the Library items host too, so the page has its ⋮. */
function withMenu(rename: (ref: unknown, name: string) => Promise<void>): ItemViewProps {
  const { props, host } = setup(sourceOf([swim]), undefined, { rename });
  const provided = new Map<unknown, unknown>([
    [CollectionHostService, host],
    [LibraryItemsHostService, items],
  ]);
  const services = limitedLookup(libraryFeature, {
    get: (key: unknown) => provided.get(key),
    find: (key: unknown) => provided.get(key),
  });
  return { ...props, context: { ...props.context, services } } as ItemViewProps;
}

/** The collection page under a phone's top bar, as the phone's item page shows it. */
async function openedOnPhone(rename: (ref: unknown, name: string) => Promise<void>) {
  const root = render(
    <PresentationProvider presentation="phone">
      <ToastStoreProvider store={createToastStore()}>
        <PhoneTopBarSlot value={topBar}>
          <CollectionPage {...withMenu(rename)} />
        </PhoneTopBarSlot>
      </ToastStoreProvider>
    </PresentationProvider>,
  );
  await settled();
  return root;
}

/** Opens the page's ⋮ (not a row's menu) under `scope` and gives its entries. */
function openPageMenu(scope: HTMLElement): HTMLElement[] {
  const trigger = scope.querySelector<HTMLElement>('button[aria-label="More actions for Claims"]');
  act(() => trigger?.click());
  const menu = document.getElementById(trigger?.getAttribute("popovertarget") ?? "");
  return [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
}

const labels = (entries: HTMLElement[]) => entries.map((each) => each.textContent);

async function openRenameSheet(): Promise<HTMLDialogElement> {
  const entry = openPageMenu(topBar).find((each) => each.textContent === "Rename");
  await act(async () => entry?.click());
  return document.querySelector("dialog[open]") as HTMLDialogElement;
}

async function renameTo(sheet: HTMLDialogElement, text: string) {
  const input = sheet.querySelector("input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const confirm = [...sheet.querySelectorAll("button")].find((button) =>
    button.textContent?.trim().startsWith("Rename"),
  );
  await act(async () => {
    confirm?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

verifies("library.collection-page", () => {
  describe("CollectionPage on a phone", () => {
    it("names the collection once, in the top bar, and keeps its title for screen readers", async () => {
      const root = await openedOnPhone(async () => {});
      const title = root.querySelector("h1");
      expect(title?.textContent).toBe("Claims");
      expect(title?.className).toBe("sr-only");
      expect(title?.tabIndex).toBe(-1);
      expect(root.querySelector('input[aria-label="Name"]')).toBeNull();
      // No title row is drawn around the hidden title, so no empty row takes room.
      expect(title?.parentElement?.querySelector(":scope > .justify-between")).toBeNull();
    });

    it("starts ⋮ with Rename, before Open as file and Delete", async () => {
      await openedOnPhone(async () => {});
      expect(labels(openPageMenu(topBar))).toEqual(["Rename", "Open as file", "Delete"]);
    });

    it("renames from the sheet, and renames nothing for an empty or the same name", async () => {
      const rename = vi.fn(async () => {});
      await openedOnPhone(rename);
      let sheet = await openRenameSheet();
      expect(sheet.textContent).toContain("Rename collection");
      await renameTo(sheet, "  ");
      expect(sheet.textContent).toContain("Give it a name.");
      expect(sheet.hasAttribute("open")).toBe(true);
      await renameTo(sheet, "Claims");
      expect(document.querySelector("dialog[open]")).toBeNull();
      expect(rename).not.toHaveBeenCalled();

      sheet = await openRenameSheet();
      await renameTo(sheet, "Claims 2024");
      expect(rename).toHaveBeenCalledExactlyOnceWith({ hub: null, id: "claims" }, "Claims 2024");
      expect(document.querySelector("dialog[open]")).toBeNull();
    });

    it("says on the page when the rename fails", async () => {
      const root = await openedOnPhone(async () => {
        throw new Error("disk");
      });
      await renameTo(await openRenameSheet(), "Claims 2024");
      expect(root.querySelector('[role="alert"]')?.textContent).toBe(
        "Couldn't rename the collection.",
      );
    });
  });
});

verifies("library.collection-page", () => {
  it("keeps the name field and no Rename in ⋮ on the desktop", async () => {
    const root = render(
      <ToastStoreProvider store={createToastStore()}>
        <CollectionPage {...withMenu(async () => {})} />
      </ToastStoreProvider>,
    );
    await settled();
    expect(root.querySelector('h1 input[aria-label="Name"]')).not.toBeNull();
    expect(labels(openPageMenu(root))).toEqual(["Open as file", "Delete"]);
  });
});
