// @vitest-environment jsdom
import type { LibraryItemKind } from "@halonicjs/app";
import { createToastStore, PresentationProvider, ToastStoreProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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

const host: LibraryItemsHost = {
  list: async () => ({
    hubs: [],
    shared: {
      workspaceName: "Acme",
      entries: [
        {
          id: "tone",
          name: "Tone",
          usage: { agents: [], hubs: [], routines: [], collections: [] },
        },
      ],
    },
  }),
  remove: vi.fn(async () => ({ undo: async () => {} })),
  subscribe: () => () => {},
};

async function showOnPhone(kind: LibraryItemKind) {
  const page = render(
    <PresentationProvider presentation="phone">
      <ToastStoreProvider store={createToastStore()}>
        <LibraryPage
          host={host}
          kind={kind}
          onKindChange={() => undefined}
          onOpen={() => undefined}
          onOpenInNewTab={() => undefined}
        />
      </ToastStoreProvider>
    </PresentationProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return page;
}

const menuEntries = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);

const menuButton = 'button[aria-label="More actions for Tone"]';

verifies("library.library-phone", () => {
  it.each(["knowledge", "connector"] as const)(
    "keeps Open and Open in new tab but not Delete on a phone's %s rows",
    async (kind) => {
      const page = await showOnPhone(kind);
      expect(page.textContent).toContain("Tone");
      act(() => page.querySelector<HTMLElement>(menuButton)?.click());
      expect(menuEntries()).toEqual(["Open", "Open in new tab"]);
    },
  );

  it.each(["skill", "collection"] as const)("keeps Delete on a phone's %s rows", async (kind) => {
    const page = await showOnPhone(kind);
    act(() => page.querySelector<HTMLElement>(menuButton)?.click());
    expect(menuEntries()).toEqual(["Open", "Open in new tab", "Delete"]);
  });
});
