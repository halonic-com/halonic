// @vitest-environment jsdom

import type { FilesWithErrorsSource, FileWithErrors } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { listing, memoryHost, show, typeInto, unmount } from "../test-support.tsx";
import { listWords } from "./list-words.ts";
import { RoutinesView } from "./routines-page.tsx";

afterEach(unmount);

const nightlyFile: FileWithErrors = {
  path: "hubs/support/routines/nightly.routine.yaml",
  kind: "routine",
  hub: "support",
  id: "nightly",
  name: "nightly.routine.yaml",
  loaded: false,
  firstError: { line: 4, col: 3, reason: "every needs a time." },
  errors: 1,
};

/** The shared list with the broken routine, and a workflow file that isn't the Routines list's to show. */
const filesWithErrors: FilesWithErrorsSource = {
  list: async () => [
    nightlyFile,
    {
      ...nightlyFile,
      kind: "workflow",
      path: "hubs/support/workflows/reply.workflow.yaml",
      name: "Reply",
    },
  ],
  subscribe: () => () => undefined,
};

const hubs = [
  { id: "reports", name: "Reports" },
  { id: "support", name: "Support" },
];

async function showList(
  open = vi.fn(),
  listings = [listing("reports", "weekly", "Weekly digest")],
) {
  const { host } = memoryHost(hubs, listings);
  const page = await show(
    <RoutinesView
      host={host}
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

verifies("routines.list.broken-rows", () => {
  it("keeps a row for a routine file that didn't load, in the error state, in its hub", async () => {
    const page = await showList();

    const row = cellOf(page, "nightly.routine.yaml");

    expect(row?.textContent).toContain("1 problem");
    expect(page.querySelector(".text-danger")?.textContent).toBe("Line 4: every needs a time.");
    expect(page.textContent).not.toContain("No routines in Support yet");
    expect(page.textContent).not.toContain("Reply");
  });

  it("opens the file at its first problem when the row is clicked", async () => {
    const open = vi.fn();
    const page = await showList(open);

    await act(async () => cellOf(page, "nightly.routine.yaml")?.click());

    expect(open).toHaveBeenCalledWith(nightlyFile);
  });

  it("finds the row by its file name", async () => {
    const page = await showList();
    const field = page.querySelector<HTMLInputElement>('input[type="search"]');

    if (field !== null) await typeInto(field, "nightly");

    expect(cellOf(page, "nightly.routine.yaml")).toBeDefined();
    expect(cellOf(page, "Weekly digest")).toBeUndefined();
  });

  it("keeps its sentence and no empty state when the only routine file is broken", async () => {
    const page = await showList(vi.fn(), []);

    expect(page.textContent).toContain(listWords.sentence);
    expect(page.textContent).not.toContain(listWords.nothingYetTitle);
    expect(cellOf(page, "nightly.routine.yaml")).toBeDefined();
  });
});
