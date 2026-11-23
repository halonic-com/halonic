// @vitest-environment jsdom
import type { FileWithErrors, WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fileItem } from "../file-item.ts";
import { takeOpenAtLineRequests } from "../open-at-line.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { installFakePopover } from "../test-support/popover.ts";
import {
  contextOf,
  listOf,
  settled,
  show,
  sorter,
  weekly,
} from "../test-support/problem-files.test-helper.tsx";
import { render, unmountAll } from "../test-support/render.tsx";
import { ProblemsHomeCard } from "./problems-home-card.tsx";
import { problemsSignal, subscribeProblems } from "./problems-signal.ts";
import { ProblemsStatusItem } from "./problems-status-item.tsx";

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

const card = (context: WorkspaceContext) => <ProblemsHomeCard context={context} attempt={0} />;

/** `count` agents with errors, named Agent 1 to Agent N. */
const agents = (count: number): FileWithErrors[] =>
  Array.from({ length: count }, (_, index) => ({
    ...sorter,
    path: `hubs/support/agents/agent-${index + 1}.agent.yaml`,
    name: `Agent ${index + 1}`,
  }));

/** The button "Show all N files", found by its words. */
const showAllButton = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Show all"));

const rows = (page: HTMLElement) => [...page.querySelectorAll<HTMLElement>("tr[data-row-id]")];

verifies("files.problems.home", () => {
  it("lists each file with its first problem and its count, read as name, kind and count", async () => {
    const { page } = await show(vi.fn, listOf([sorter, weekly]).source, card);
    expect(rows(page).map((row) => row.textContent)).toEqual([
      'SorterLine 2: A value has ": " in it. Put the value in quotes.1 problem',
      "weekly-report.workflow.yamlLine 11: options needs at least one choice.3 problems",
    ]);
    expect(page.querySelector("[aria-label^='Sorter']")?.getAttribute("aria-label")).toBe(
      'Sorter, agent, 1 problem. Line 2: A value has ": " in it. Put the value in quotes.',
    );
    expect(page.querySelectorAll("[data-place-icon]")[1]?.getAttribute("data-place-icon")).toBe(
      "workflows",
    );
  });

  it("opens a row's file at its first problem", async () => {
    const { page, openItem } = await show(vi.fn, listOf([sorter, weekly]).source, card);
    const lines: number[] = [];
    const stop = takeOpenAtLineRequests(weekly.path, (line) => lines.push(line));
    await act(async () => rows(page)[1]?.querySelector<HTMLElement>("[role=gridcell]")?.click());
    stop();
    expect(lines).toEqual([11]);
    expect(openItem).toHaveBeenCalledWith(fileItem(weekly.path));
  });

  it("shows five files, then Show all, which opens the status bar's list", async () => {
    const { page } = await show(vi.fn, listOf(agents(6)).source, card);
    expect(rows(page)).toHaveLength(5);
    const showAll = showAllButton(page);
    expect(showAll?.textContent).toBe("Show all 6 files");

    await act(async () => showAll?.click());
    expect(document.querySelectorAll("[role=menuitem]")).toHaveLength(6);
  });

  it("opens the strip's sheet from Show all on a phone", async () => {
    const { page } = await show(vi.fn, listOf(agents(6)).source, card, "phone");
    await act(async () => showAllButton(page)?.click());
    expect(document.querySelector("dialog[open] h2")?.textContent).toBe("6 files with problems");
  });

  it("shows nothing at zero, and goes when a save fixes the last file", async () => {
    const none = await show(vi.fn, listOf([]).source, card);
    expect(none.page.textContent).toBe("");

    const list = listOf([sorter]);
    const one = await show(vi.fn, list.source, card);
    expect(rows(one.page)).toHaveLength(1);
    await list.save([]);
    expect(one.page.textContent).toBe("");
  });

  it("gives the heading the count of files, and none at zero", async () => {
    const list = listOf([sorter, weekly]);
    const { context } = contextOf(vi.fn, list.source);
    const heard: (string | undefined)[] = [];
    const stop = subscribeProblems(context, () => heard.push(problemsSignal(context)?.spoken));
    await settled();
    expect(problemsSignal(context)).toEqual({ mark: "count", value: 2, spoken: "2 files" });

    await list.save([sorter]);
    await list.save([]);
    stop();
    expect(heard).toEqual(["2 files", "1 file", undefined]);
  });

  it("reads the list once for the status bar, Home and its heading", async () => {
    const list = listOf([sorter]);
    const { context } = contextOf(vi.fn, list.source);
    const stop = subscribeProblems(context, () => {});
    render(
      <>
        <ProblemsStatusItem context={context} />
        <ProblemsHomeCard context={context} attempt={0} />
      </>,
    );
    await settled();
    expect(list.reads()).toBe(1);

    await list.save([sorter, weekly]);
    stop();
    expect(list.reads()).toBe(2);
  });
});
