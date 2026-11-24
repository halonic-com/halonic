// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fileItem } from "../file-item.ts";
import { takeOpenAtLineRequests } from "../open-at-line.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { listOf, show, sorter, weekly } from "../test-support/problem-files.test-helper.tsx";
import { unmountAll } from "../test-support/render.tsx";
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

const statusItem = (context: WorkspaceContext) => <ProblemsStatusItem context={context} />;
const strip = (context: WorkspaceContext) => <ProblemsStrip context={context} />;

const button = (page: HTMLElement) => page.querySelector("button");

/** The entries of the open menu or sheet, as their name, line and kind read together. */
const entries = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].map((entry) => entry.textContent);

verifies("files.problems.count", () => {
  it("counts the files with errors in the status bar, and shows nothing at zero", async () => {
    const one = await show(vi.fn, listOf([sorter]).source, statusItem);
    expect(button(one.page)?.textContent).toBe("1 file with a problem·Show");
    expect(button(one.page)?.getAttribute("aria-label")).toBe("1 file with a problem. Show");

    const two = await show(vi.fn, listOf([sorter, weekly]).source, statusItem);
    expect(button(two.page)?.textContent).toBe("2 files with problems·Show");

    const none = await show(vi.fn, listOf([]).source, statusItem);
    expect(none.page.textContent).toBe("");
  });

  it("lists each file with its first problem and kind, and opens it at that line", async () => {
    const { page, openItem } = await show(vi.fn, listOf([sorter, weekly]).source, statusItem);
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
    const { announceState } = await show(vi.fn, list.source, statusItem);
    expect(announceState).not.toHaveBeenCalled();

    await list.save([sorter]);
    expect(announceState).toHaveBeenLastCalledWith("files.problems", "1 file with a problem");

    await list.save([sorter]);
    expect(announceState).toHaveBeenCalledTimes(1);

    await list.save([]);
    expect(announceState).toHaveBeenLastCalledWith("files.problems", "No files with problems");
  });

  it("puts the count in a strip on a phone, which opens a sheet of the files", async () => {
    const { page, openItem } = await show(vi.fn, listOf([sorter, weekly]).source, strip, "phone");
    expect(button(page)?.textContent).toBe("2 files with problems·Show");

    await act(async () => button(page)?.click());
    const sheet = document.querySelector("dialog[open]");
    expect(sheet?.querySelector("h2")?.textContent).toBe("2 files with problems");
    expect(sheet?.textContent).toContain("Each opens its file at the first problem.");

    const rows = [...(sheet?.querySelectorAll<HTMLElement>("button, a") ?? [])].filter((row) =>
      row.textContent?.startsWith("weekly-report"),
    );
    // Taking the request also keeps it from waiting for a later test file: files share this
    // module's requests in a worker (`isolate: false`).
    const lines: number[] = [];
    const stop = takeOpenAtLineRequests(weekly.path, (line) => lines.push(line));
    await act(async () => rows[0]?.click());
    stop();

    expect(lines).toEqual([11]);
    expect(openItem).toHaveBeenCalledWith(fileItem(weekly.path));
    expect(document.querySelector("dialog[open]")).toBeNull();
  });

  it("draws the count as one danger pill with Show underlined, the strip as a band", async () => {
    const desktop = await show(vi.fn, listOf([sorter]).source, statusItem);
    const phone = await show(vi.fn, listOf([sorter]).source, strip, "phone");
    for (const page of [desktop.page, phone.page]) {
      const pill = button(page);
      expect(pill?.className).toContain("bg-over-surface-danger-soft");
      expect(pill?.className).toContain("text-danger");
      expect(pill?.className).toContain("contrast-more:border-danger");
      expect(pill?.className).not.toContain("bg-surface-muted");
      // 24 px high like the status bar's other items, not 20 (C46 PB1).
      expect(pill?.className.split(" ")).toContain("min-h-6");
      expect(pill?.querySelector("svg")).not.toBeNull();
      expect(pill?.querySelector(".underline")?.textContent).toBe("Show");
    }
    const band = phone.page.querySelector("button")?.parentElement;
    expect(band?.className).toContain("bg-surface-subtle");
    expect(band?.className).toContain("border-b");
  });

  it("leaves the strip out on the desktop and at zero on a phone", async () => {
    const desktop = await show(vi.fn, listOf([sorter]).source, strip);
    expect(desktop.page.textContent).toBe("");

    const phone = await show(vi.fn, listOf([]).source, strip, "phone");
    expect(phone.page.textContent).toBe("");
  });
});
