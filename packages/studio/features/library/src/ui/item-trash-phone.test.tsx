// @vitest-environment jsdom
import type { LibraryItemKind } from "@halonicjs/app";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type LibraryItemsHost, LibraryItemsHostService } from "../library-items-host.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { useItemTrash } from "./item-trash.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restorePopover();
});

const host: LibraryItemsHost = {
  list: async () => ({ hubs: [], shared: { workspaceName: "Acme", entries: [] } }),
  remove: vi.fn(async () => ({ undo: async () => {} })),
  readFile: async () => "",
  subscribe: () => () => {},
};

const context = {
  services: { find: (key: unknown) => (key === LibraryItemsHostService ? host : undefined) },
  openItem: vi.fn(),
} as unknown as ItemViewProps["context"];

function Page({ kind }: { kind: LibraryItemKind }) {
  const { menu } = useItemTrash(context, { kind, hub: "~workspace", id: "tone", name: "Tone" });
  return <div>{menu}</div>;
}

function showOnPhone(kind: LibraryItemKind) {
  return render(
    <PresentationProvider presentation="phone">
      <ToastStoreProvider store={createToastStore()}>
        <Page kind={kind} />
      </ToastStoreProvider>
    </PresentationProvider>,
  );
}

const menuButton = 'button[aria-label="More actions for Tone"]';

verifies("library.library-phone", () => {
  it.each(["knowledge", "connector"] as const)(
    "has only Open as file on a phone's %s page",
    (kind) => {
      const page = showOnPhone(kind);
      act(() => page.querySelector<HTMLElement>(menuButton)?.click());
      const entries = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
      expect(entries).toEqual(["Open as file"]);
    },
  );

  it.each(["skill", "collection"] as const)(
    "keeps Open as file and Delete on a phone's %s page",
    (kind) => {
      const page = showOnPhone(kind);
      act(() => page.querySelector<HTMLElement>(menuButton)?.click());
      const entries = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
      expect(entries).toEqual(["Open as file", "Delete"]);
    },
  );
});
