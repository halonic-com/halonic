// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FilesHost, FilesListing } from "../files-host.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { FilesSidebarView } from "./files-sidebar-view.tsx";

afterEach(unmountAll);

const listing = (paths: string[], marks: FilesListing["marks"] = new Map()): FilesListing => ({
  paths,
  marks,
});

function contextOf(host: FilesHost): WorkspaceContext {
  const services = { get: () => host, find: () => host };
  return { services } as unknown as WorkspaceContext;
}

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function show(host: FilesHost): Promise<HTMLElement> {
  const page = render(<FilesSidebarView context={contextOf(host)} />);
  await settled();
  return page;
}

function rowNamed(page: HTMLElement, path: string): HTMLElement {
  const row = page.querySelector<HTMLElement>(`[data-path="${path}"]`);
  if (row === null) throw new Error(`no row ${path}`);
  return row;
}

function press(row: HTMLElement, key: string): void {
  act(() => {
    row.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

verifies("files.ui.tree-view", () => {
  const files = ["hubs/p/hub.yaml", "models.yaml"];
  const hostOf = (value: FilesListing): FilesHost => ({
    list: async () => value,
    subscribe: () => () => {},
    read: async () => null,
    edit: () => {},
    problems: async () => [],
    outside: () => new Map(),
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
  });

  it("shows an ARIA tree with one Tab stop and the folders closed", async () => {
    const page = await show(hostOf(listing(files)));
    expect(page.querySelector('[role="tree"]')?.getAttribute("aria-label")).toBe("Files");
    const stops = page.querySelectorAll('[role="treeitem"][tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0]?.getAttribute("data-path")).toBe("hubs");
    expect(rowNamed(page, "hubs").getAttribute("aria-expanded")).toBe("false");
    expect(page.querySelector('[data-path="hubs/p"]')).toBeNull();
  });

  it("opens and closes a folder on click", async () => {
    const page = await show(hostOf(listing(files)));
    act(() => rowNamed(page, "hubs").click());
    expect(rowNamed(page, "hubs").getAttribute("aria-expanded")).toBe("true");
    expect(rowNamed(page, "hubs/p").getAttribute("aria-level")).toBe("2");
    act(() => rowNamed(page, "hubs").click());
    expect(page.querySelector('[data-path="hubs/p"]')).toBeNull();
  });

  it("moves with the arrow keys and keeps the focus on the focused row", async () => {
    const page = await show(hostOf(listing(files)));
    const hubs = rowNamed(page, "hubs");
    hubs.focus();
    press(hubs, "ArrowRight");
    expect(rowNamed(page, "hubs").getAttribute("aria-expanded")).toBe("true");
    press(rowNamed(page, "hubs"), "ArrowDown");
    expect(document.activeElement).toBe(rowNamed(page, "hubs/p"));
    expect(rowNamed(page, "hubs/p").tabIndex).toBe(0);
    expect(rowNamed(page, "hubs").tabIndex).toBe(-1);
  });

  it("says a folder's error count to a screen reader and cuts a long name in the middle", async () => {
    const long = `${"a".repeat(30)}.agent.yaml`;
    const page = await show(
      hostOf(listing([...files, long], new Map([["hubs/p/hub.yaml", { errors: 2 }]]))),
    );
    expect(rowNamed(page, "hubs").getAttribute("aria-description")).toBe("2 errors");
    expect(rowNamed(page, long).textContent).toContain("…");
    expect(rowNamed(page, long).title).toBe(long);
  });

  it("shows grey bars while the list loads", () => {
    const pending: FilesHost = { ...hostOf(listing([])), list: () => new Promise(() => {}) };
    const page = render(<FilesSidebarView context={contextOf(pending)} />);
    expect(page.querySelector('[role="status"]')).not.toBeNull();
    expect(page.querySelector('[role="tree"]')).toBeNull();
  });

  it("says it couldn't load, and shows the tree after Try again works", async () => {
    const list = vi
      .fn<FilesHost["list"]>()
      .mockRejectedValueOnce(new Error("The folder is not readable."))
      .mockResolvedValue(listing(files));
    const page = await show({ ...hostOf(listing([])), list });
    expect(page.textContent).toContain("Couldn't load files");
    expect(page.textContent).toContain("The folder is not readable.");
    const retry = [...page.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Try again"),
    );
    act(() => retry?.click());
    await settled();
    expect(page.querySelector('[role="tree"]')).not.toBeNull();
  });

  it("says there are no files", async () => {
    const page = await show(hostOf(listing([])));
    expect(page.textContent).toContain("No files yet");
  });

  it("lists again on a change and keeps the opened folders", async () => {
    let changed = () => {};
    let current = listing(files);
    const host: FilesHost = {
      ...hostOf(listing([])),
      list: async () => current,
      subscribe: (listener) => {
        changed = listener;
        return () => {};
      },
    };
    const page = await show(host);
    act(() => rowNamed(page, "hubs").click());
    current = listing([...files, "hubs/p/b.agent.yaml"]);
    act(() => changed());
    await settled();
    expect(rowNamed(page, "hubs").getAttribute("aria-expanded")).toBe("true");
    expect(rowNamed(page, "hubs/p")).toBeDefined();
  });

  it("keeps the newest listing when an older one arrives late", async () => {
    let changed = () => {};
    const pending: Array<(value: FilesListing) => void> = [];
    const host: FilesHost = {
      ...hostOf(listing([])),
      list: () => new Promise((resolve) => pending.push(resolve)),
      subscribe: (listener) => {
        changed = listener;
        return () => {};
      },
    };
    const page = render(<FilesSidebarView context={contextOf(host)} />);
    act(() => changed());
    await act(async () => {
      pending[1]?.(listing(["new.yaml"]));
      await Promise.resolve();
    });
    await act(async () => {
      pending[0]?.(listing(["old.yaml"]));
      await Promise.resolve();
    });
    expect(page.querySelector('[data-path="new.yaml"]')).not.toBeNull();
    expect(page.querySelector('[data-path="old.yaml"]')).toBeNull();
  });
});
