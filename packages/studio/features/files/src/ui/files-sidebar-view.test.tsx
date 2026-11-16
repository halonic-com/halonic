// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { FilesHost, FilesListing } from "../files-host.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
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
    noteHeld: () => undefined,
    yamlSyntaxLine: async () => null,
    onReloaded: () => () => undefined,
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
    create: async () => {},
    renameImpact: async () => 0,
    rename: async () => {},
    remove: async () => ({ places: 0, undo: async () => {} }),
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

verifies("files.ui.new-file", () => {
  const hostOf = (create: FilesHost["create"]): FilesHost => ({
    list: async () => listing(["agents/a.agent.yaml", "models.yaml"]),
    subscribe: () => () => {},
    read: async () => null,
    edit: () => {},
    create,
    renameImpact: async () => 0,
    rename: async () => {},
    remove: async () => ({ places: 0, undo: async () => {} }),
    problems: async () => [],
    outside: () => new Map(),
    noteHeld: () => undefined,
    yamlSyntaxLine: async () => null,
    onReloaded: () => () => undefined,
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
  });

  async function open(create: FilesHost["create"] = async () => {}) {
    fakeModal();
    const openItem = vi.fn();
    const context = { ...contextOf(hostOf(create)), openItem } as unknown as WorkspaceContext;
    const page = render(<FilesSidebarView context={context} />);
    await settled();
    return { page, openItem };
  }

  const press = async (label: string) => {
    const button = [...document.querySelectorAll("button")].find(
      (each) => each.getAttribute("aria-label") === label || each.textContent?.startsWith(label),
    );
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  afterEach(() => {
    unmountAll();
    restoreModal();
  });

  it("has a New file button that opens the dialog at hubs/", async () => {
    await open();
    await press("New file");
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("hubs/");
  });

  it("starts at the focused folder", async () => {
    const { page } = await open();
    act(() => rowNamed(page, "agents").click());
    await press("New file");
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("agents/");
  });

  it("opens the file it made and closes the dialog", async () => {
    const create = vi.fn(async () => {});
    const { openItem } = await open(create);
    await press("New file");
    const input = document.querySelector<HTMLInputElement>("input");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      set?.call(input, "hubs/b.yaml");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await press("Create");
    expect(create).toHaveBeenCalledWith("hubs/b.yaml");
    expect(openItem).toHaveBeenCalledWith({ kind: "file", hub: "workspace", id: "hubs/b.yaml" });
    expect(document.querySelector("input")).toBeNull();
  });
});

verifies("files.ui.rename-file", () => {
  afterEach(() => {
    unmountAll();
    restoreModal();
  });

  it("opens Rename on F2 for the focused file and opens the new path after it", async () => {
    fakeModal();
    const rename = vi.fn(async () => {});
    const host: FilesHost = {
      ...contextHost(),
      rename,
    };
    const openItem = vi.fn();
    const context = { ...contextOf(host), openItem } as unknown as WorkspaceContext;
    const page = render(<FilesSidebarView context={context} />);
    await settled();
    const row = rowNamed(page, "models.yaml");
    act(() => row.click());
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    const input = document.querySelector<HTMLInputElement>("input");
    expect(input?.value).toBe("models.yaml");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      set?.call(input, "providers.yaml");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = [...document.querySelectorAll("button")].find((each) =>
      each.textContent?.startsWith("Rename"),
    );
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(rename).toHaveBeenCalledWith("models.yaml", "providers.yaml");
    expect(openItem).toHaveBeenCalledWith({ kind: "file", hub: "workspace", id: "providers.yaml" });
    expect(document.querySelector("input")).toBeNull();
  });
});

verifies("files.ui.delete-file", () => {
  it("deletes the focused file on Delete without a dialog", async () => {
    const remove = vi.fn(async () => ({ places: 0, undo: async () => {} }));
    const host: FilesHost = { ...contextHost(), remove };
    const page = await show(host);
    const row = rowNamed(page, "models.yaml");
    act(() => row.click());
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(remove).toHaveBeenCalledWith("models.yaml");
    expect(document.querySelector("input")).toBeNull();
  });
});

function contextHost(): FilesHost {
  return {
    list: async () => listing(["agents/a.agent.yaml", "models.yaml"]),
    subscribe: () => () => {},
    read: async () => null,
    edit: () => {},
    create: async () => {},
    renameImpact: async () => 0,
    rename: async () => {},
    remove: async () => ({ places: 0, undo: async () => {} }),
    problems: async () => [],
    outside: () => new Map(),
    noteHeld: () => undefined,
    yamlSyntaxLine: async () => null,
    onReloaded: () => () => undefined,
    compare: async (path) => ({ path, mine: null, theirs: null, combined: null }),
    settle: async () => {},
  };
}
