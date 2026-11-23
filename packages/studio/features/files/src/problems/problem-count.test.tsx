// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { fileItem } from "../file-item.ts";
import { takeOpenAtLineRequests } from "../open-at-line.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { listOf, show, sorter, weekly } from "../test-support/problem-files.tsx";
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
