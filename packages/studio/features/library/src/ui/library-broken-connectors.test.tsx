// @vitest-environment jsdom

import type { FilesWithErrorsSource, FileWithErrors } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LibraryItemsHost, LibraryListing } from "../library-items-host.ts";
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

const noUsage = { agents: [], hubs: [], routines: [], collections: [] };

const crmFile: FileWithErrors = {
  path: "hubs/support/connectors/crm.connector.yaml",
  kind: "connector",
  hub: "support",
  id: "crm",
  name: "crm.connector.yaml",
  loaded: false,
  firstError: { line: 3, col: 1, reason: "url must start with https://." },
  errors: 1,
};

/** The shared list with the broken connector, and a routine file that isn't the Library's to show. */
const filesWithErrors: FilesWithErrorsSource = {
  list: async () => [
    crmFile,
    { ...crmFile, kind: "routine", path: "hubs/support/routines/nightly.routine.yaml" },
  ],
  subscribe: () => () => undefined,
};

const connectors: LibraryListing = {
  hubs: [
    {
      id: "reports",
      name: "Reports",
      entries: [{ id: "sheets", name: "Sheets", usage: noUsage }],
    },
    { id: "support", name: "Support", entries: [] },
  ],
};

function hostWith(listing: LibraryListing): LibraryItemsHost {
  return {
    list: async (kind: string) => (kind === "connector" ? listing : { hubs: [] }),
    remove: vi.fn(async () => ({ undo: vi.fn(async () => {}) })),
    readFile: async () => "",
    subscribe: () => () => {},
  };
}

async function showLibrary(kind: "skill" | "connector", open = vi.fn()) {
  const page = render(
    <LibraryPage
      host={hostWith(connectors)}
      kind={kind}
      onKindChange={() => undefined}
      onOpen={() => undefined}
      onOpenInNewTab={() => undefined}
      onOpenAsFile={() => undefined}
      filesWithErrors={filesWithErrors}
      brokenActions={{ open, remove: vi.fn() }}
    />,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return page;
}

const cellOf = (page: HTMLElement, name: string) =>
  [...page.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((cell) =>
    cell.textContent?.includes(name),
  );

async function typeInto(field: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

verifies("library.broken-connectors", () => {
  it("keeps a row for a connector file that didn't load, in the error state, in its hub", async () => {
    const page = await showLibrary("connector");

    const row = cellOf(page, "crm.connector.yaml");

    expect(row?.textContent).toContain("1 problem");
    expect(page.querySelector('[role="grid"] .text-danger')?.textContent).toBe(
      "Line 3: url must start with https://.",
    );
    expect(page.textContent).not.toContain("No connectors in Support yet");
    expect(page.textContent).not.toContain("nightly.routine.yaml");
  });

  it("opens the file at its first problem when the row is clicked", async () => {
    const open = vi.fn();
    const page = await showLibrary("connector", open);

    await act(async () => cellOf(page, "crm.connector.yaml")?.click());

    expect(open).toHaveBeenCalledWith(crmFile);
  });

  it("gives the row a menu of Open file and Delete, with no Open in new tab", async () => {
    const page = await showLibrary("connector");

    act(() =>
      page
        .querySelector<HTMLElement>('button[aria-label="More actions for crm.connector.yaml"]')
        ?.click(),
    );
    const entries = [...document.querySelectorAll('[role="menuitem"]')].map(
      (each) => each.textContent,
    );

    expect(entries).toEqual(["Open file", "Delete"]);
  });

  it("finds the row by its file name", async () => {
    const page = await showLibrary("connector");
    const field = page.querySelector<HTMLInputElement>('input[type="search"]');

    expect(field).not.toBeNull();
    if (field !== null) await typeInto(field, "crm");

    expect(cellOf(page, "crm.connector.yaml")).toBeDefined();
    expect(cellOf(page, "Sheets")).toBeUndefined();
  });

  it("counts the broken connectors on the Connectors chip, from any kind", async () => {
    const page = await showLibrary("skill");

    const radio = page.querySelector('[aria-label="Library"] input[value="connector"]');
    const chip = radio?.closest("label");

    expect(chip?.textContent).toBe("Connectors1, 1 problem");
    expect(chip?.querySelector(".text-danger, [class*='danger']")).not.toBeNull();
    expect(cellOf(page, "crm.connector.yaml")).toBeUndefined();
  });
});
