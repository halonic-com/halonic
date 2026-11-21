// @vitest-environment jsdom

import type { BrokenFileActions } from "@halonicjs/studio-feature-files/api";
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { FilesWithErrorsSource, FileWithErrors } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { installFakePopover, show, unmount } from "../test-support.tsx";
import { AgentsView } from "./agents-page.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
});
afterEach(() => {
  unmount();
  restorePopover();
});

const writerFile: FileWithErrors = {
  path: "hubs/support/agents/writer.agent.yaml",
  kind: "agent",
  hub: "support",
  id: "writer",
  name: "writer.agent.yaml",
  loaded: false,
  firstError: { line: 2, col: 7, reason: 'A value has ": " in it. Put the value in quotes.' },
  errors: 1,
};

/** The shared list with `files`; a workflow that didn't load isn't the Agents list's to show. */
function filesWithErrors(files: readonly FileWithErrors[]): FilesWithErrorsSource {
  return {
    list: async () => [
      ...files,
      { ...writerFile, kind: "workflow", path: "hubs/support/workflows/reply.workflow.yaml" },
    ],
    subscribe: () => () => undefined,
  };
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function showList(actions: BrokenFileActions = {}) {
  const host = memoryAgentsHost({ hubs: [{ id: "support", name: "Support" }], agents: [] });
  const page = await show(
    <ToastStoreProvider store={createToastStore()}>
      <AgentsView
        host={host}
        filesWithErrors={filesWithErrors([writerFile])}
        brokenActions={actions}
      />
    </ToastStoreProvider>,
  );
  await settled();
  return page;
}

const rowOf = (page: HTMLElement, name: string) =>
  [...page.querySelectorAll<HTMLElement>('[role="gridcell"]')].find((cell) =>
    cell.textContent?.includes(name),
  );

verifies("agents.list.broken-rows", () => {
  it("keeps a row for an agent file that didn't load, in the error state, in its hub", async () => {
    const page = await showList();

    const row = rowOf(page, "writer.agent.yaml");

    expect(row?.textContent).toContain("1 problem");
    expect(row?.querySelector(".text-danger")?.textContent).toBe(
      'Line 2: A value has ": " in it. Put the value in quotes.',
    );
    expect(page.textContent).not.toContain("No agents in Support yet");
  });

  it("opens the file at its first problem when the row is clicked", async () => {
    const open = vi.fn();
    const page = await showList({ open });

    await act(async () => rowOf(page, "writer.agent.yaml")?.click());

    expect(open).toHaveBeenCalledWith(writerFile);
  });

  it("offers only Open file, Show in Files and Delete in the row's menu", async () => {
    const remove = vi.fn();
    const page = await showList({ open: vi.fn(), showInFiles: vi.fn(), remove });

    act(() =>
      page
        .querySelector<HTMLElement>('button[aria-label="More actions for writer.agent.yaml"]')
        ?.click(),
    );
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    act(() => items.find((item) => item.textContent === "Delete")?.click());

    expect(items.map((item) => item.textContent)).toEqual(["Open file", "Show in Files", "Delete"]);
    expect(remove).toHaveBeenCalledWith(writerFile, expect.anything());
  });

  it("finds the row by its file name", async () => {
    const page = await showList();
    const field = page.querySelector<HTMLInputElement>('input[type="search"]');

    act(() => {
      if (field === null) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        field,
        "writer.agent",
      );
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(rowOf(page, "writer.agent.yaml")).toBeDefined();
  });
});
