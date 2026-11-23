// @vitest-environment jsdom
import { PresentationProvider } from "@halonicjs/studio-kit";
import {
  type FilesWithErrorsSource,
  type FileWithErrors,
  limitedLookup,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { filesFeature } from "../feature.ts";
import { fileItem } from "../file-item.ts";
import { takeOpenAtLineRequests } from "../open-at-line.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ProblemsStatusItem } from "./problems-status-item.tsx";
import { ProblemsStrip } from "./problems-strip.tsx";

let restorePopover: () => void;
beforeEach(() => {
  restorePopover = installFakePopover();
  fakeModal();
});
afterEach(() => {
  unmountAll();
  restorePopover();
  restoreModal();
});

const sorter: FileWithErrors = {
  path: "hubs/support/agents/sorter.agent.yaml",
  kind: "agent",
  hub: "support",
  id: "sorter",
  name: "Sorter",
  loaded: false,
  firstError: { line: 2, col: 7, reason: 'A value has ": " in it. Put the value in quotes.' },
  errors: 1,
};

const weekly: FileWithErrors = {
  path: "hubs/reports/workflows/weekly-report.workflow.yaml",
  kind: "workflow",
  hub: "reports",
  id: "weekly-report",
  name: "weekly-report.workflow.yaml",
  loaded: false,
  firstError: { line: 11, col: 3, reason: "options needs at least one choice." },
  errors: 3,
};

/** A shared list whose files a test sets, telling its listeners as a save would. */
function listOf(start: readonly FileWithErrors[]) {
  let files = start;
  const listeners = new Set<() => void>();
  const source: FilesWithErrorsSource = {
    list: async () => files,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const save = async (next: readonly FileWithErrors[]) => {
    files = next;
    for (const listener of listeners) listener();
    await settled();
  };
  return { source, save };
}

async function settled(): Promise<void> {
  for (let turn = 0; turn < 3; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function show(
  source: FilesWithErrorsSource,
  view: (context: WorkspaceContext) => ReactNode,
  presentation: "desktop" | "phone" = "desktop",
) {
  const openItem = vi.fn();
  const announceState = vi.fn();
  const context = {
    services: limitedLookup(filesFeature, { get: () => source }),
    announcer: { announce: () => {}, announceState },
    openItem,
  } as unknown as WorkspaceContext;
  const page = render(
    <PresentationProvider presentation={presentation}>{view(context)}</PresentationProvider>,
  );
  await settled();
  return { page, openItem, announceState };
}

const statusItem = (context: WorkspaceContext) => <ProblemsStatusItem context={context} />;
const strip = (context: WorkspaceContext) => <ProblemsStrip context={context} />;

const button = (page: HTMLElement) => page.querySelector("button");

/** The entries of the open menu or sheet, as their name, line and kind read together. */
const entries = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].map((entry) => entry.textContent);

verifies("files.problems.count", () => {
  it("counts the files with errors in the status bar, and shows nothing at zero", async () => {
    const one = await show(listOf([sorter]).source, statusItem);
    expect(button(one.page)?.textContent).toBe("1 file with a problem·Show");
    expect(button(one.page)?.getAttribute("aria-label")).toBe("1 file with a problem. Show");

    const two = await show(listOf([sorter, weekly]).source, statusItem);
    expect(button(two.page)?.textContent).toBe("2 files with problems·Show");

    const none = await show(listOf([]).source, statusItem);
    expect(none.page.textContent).toBe("");
  });

  it("lists each file with its first problem and kind, and opens it at that line", async () => {
    const { page, openItem } = await show(listOf([sorter, weekly]).source, statusItem);
    await act(async () => button(page)?.click());

    expect(document.querySelector("[role=menu]")?.textContent).toContain(
      "Each opens its file at the first problem.",
    );
    expect(entries("[role=menuitem]")).toEqual([
      expect.stringMatching(/^Sorter.*Line 2: A value has ": " in it\. Put the value in quotes\./),
      expect.stringMatching(/^weekly-report\.workflow\.yaml.*Line 11: options needs/),
    ]);
    expect(entries("[role=menuitem]")[0]).toContain("Agent");
    expect(entries("[role=menuitem]")[1]).toContain("Workflow");

    const lines: number[] = [];
    const stop = takeOpenAtLineRequests(sorter.path, (line) => lines.push(line));
    await act(async () => document.querySelector<HTMLElement>("[role=menuitem]")?.click());
    stop();

    expect(lines).toEqual([2]);
    expect(openItem).toHaveBeenCalledWith(fileItem(sorter.path));
  });

  it("says a change of the count once, but not the first count", async () => {
    const list = listOf([sorter, weekly]);
    const { announceState } = await show(list.source, statusItem);
    expect(announceState).not.toHaveBeenCalled();

    await list.save([sorter]);
    expect(announceState).toHaveBeenLastCalledWith("files.problems", "1 file with a problem");

    await list.save([sorter]);
    expect(announceState).toHaveBeenCalledTimes(1);

    await list.save([]);
    expect(announceState).toHaveBeenLastCalledWith("files.problems", "No files with problems");
  });

  it("puts the count in a strip on a phone, which opens a sheet of the files", async () => {
    const { page, openItem } = await show(listOf([sorter, weekly]).source, strip, "phone");
    expect(button(page)?.textContent).toBe("2 files with problems·Show");

    await act(async () => button(page)?.click());
    const sheet = document.querySelector("dialog[open]");
    expect(sheet?.querySelector("h2")?.textContent).toBe("2 files with problems");
    expect(sheet?.textContent).toContain("Each opens its file at the first problem.");

    const rows = [...(sheet?.querySelectorAll<HTMLElement>("button, a") ?? [])].filter((row) =>
      row.textContent?.startsWith("weekly-report"),
    );
    await act(async () => rows[0]?.click());
    expect(openItem).toHaveBeenCalledWith(fileItem(weekly.path));
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("leaves the strip out on the desktop and at zero on a phone", async () => {
    const desktop = await show(listOf([sorter]).source, strip);
    expect(desktop.page.textContent).toBe("");

    const phone = await show(listOf([]).source, strip, "phone");
    expect(phone.page.textContent).toBe("");
  });
});
