// @vitest-environment jsdom

import type { FilesWithErrorsSource, FileWithErrors } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { listing, memoryHost, show, typeInto, unmount } from "../test-support.tsx";
import { WorkflowsView } from "./workflows-page.tsx";

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
});
