// @vitest-environment jsdom

import type { RemoveFocus } from "@halonicjs/studio-feature-files/api";
import type { FilesWithErrorsSource, FileWithErrors } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { listing, memoryHost, show, typeInto, unmount } from "../test-support.tsx";
import { WorkflowsView } from "./workflows-page.tsx";

// jsdom has no popover: a menu closes itself after a pick by hiding it.
beforeAll(() => {
  HTMLElement.prototype.showPopover ??= () => {};
  HTMLElement.prototype.hidePopover ??= () => {};
});
afterEach(unmount);

const reportFile: FileWithErrors = {
  path: "hubs/reports/workflows/weekly-report.workflow.yaml",
  kind: "workflow",
  hub: "reports",
  id: "weekly-report",
  name: "weekly-report.workflow.yaml",
  loaded: false,
  firstError: { line: 11, col: 5, reason: "options needs at least one choice." },
  errors: 1,
};

/** The shared list with the broken report, and an agent file that isn't the Workflows list's to show. */
const filesWithErrors: FilesWithErrorsSource = {
  list: async () => [
    reportFile,
    { ...reportFile, kind: "agent", path: "hubs/reports/agents/writer.agent.yaml", name: "Writer" },
  ],
  subscribe: () => () => undefined,
};

const hubs = [
  { id: "reports", name: "Reports" },
  { id: "support", name: "Support" },
];

async function showList(open = vi.fn()) {
  const { host } = memoryHost(hubs, [listing("support", "reply", "Support reply")]);
  const page = await show(
    <WorkflowsView host={host} filesWithErrors={filesWithErrors} brokenActions={{ open }} />,
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

verifies("workflows.list.broken-rows", () => {
  it("keeps a row for a workflow file that didn't load, in the error state, in its hub", async () => {
    const page = await showList();

    const row = cellOf(page, "weekly-report.workflow.yaml");

    expect(row?.textContent).toContain("1 problem");
    expect(page.querySelector(".text-danger")?.textContent).toBe(
      "Line 11: options needs at least one choice.",
    );
    expect(page.textContent).not.toContain("No workflows in Reports yet");
    expect(page.textContent).not.toContain("Writer");
  });

  it("opens the file at its first problem when the row is clicked", async () => {
    const open = vi.fn();
    const page = await showList(open);

    await act(async () => cellOf(page, "weekly-report.workflow.yaml")?.click());

    expect(open).toHaveBeenCalledWith(reportFile);
  });

  it("gives only the broken row a ⋮ menu", async () => {
    const page = await showList();

    const menus = [...page.querySelectorAll("button[aria-label^='More actions']")];

    expect(menus.map((button) => button.getAttribute("aria-label"))).toEqual([
      expect.stringContaining("weekly-report.workflow.yaml"),
    ]);
  });

  it("finds the row by its file name", async () => {
    const page = await showList();
    const field = page.querySelector<HTMLInputElement>('input[type="search"]');

    if (field !== null) await typeInto(field, "weekly-report");

    expect(cellOf(page, "weekly-report.workflow.yaml")).toBeDefined();
    expect(cellOf(page, "Support reply")).toBeUndefined();
  });

  it("moves the focus to the next row on Delete, and back to the row on Undo", async () => {
    let files: readonly FileWithErrors[] = [reportFile];
    const listeners = new Set<() => void>();
    const changeTo = async (next: readonly FileWithErrors[]) => {
      files = next;
      await act(async () => {
        for (const listener of listeners) listener();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
    const source: FilesWithErrorsSource = {
      list: async () => files,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    let focus: RemoveFocus | undefined;
    const remove = vi.fn((_file: FileWithErrors, given?: RemoveFocus) => {
      focus = given;
    });
    const { host } = memoryHost(hubs, [listing("support", "reply", "Support reply")]);
    const page = await show(
      <WorkflowsView host={host} filesWithErrors={source} brokenActions={{ remove }} />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () =>
      page.querySelector<HTMLElement>("button[aria-label^='More actions']")?.click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "Delete")
        ?.click(),
    );
    await act(async () => focus?.removed?.());
    await changeTo([]);

    expect(document.activeElement).toBe(cellOf(page, "Support reply"));

    await act(async () => focus?.restored?.());
    await changeTo([reportFile]);

    expect(document.activeElement).toBe(cellOf(page, "weekly-report.workflow.yaml"));
  });
});
