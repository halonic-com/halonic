import type { MenuEntry, MenuItem } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { type WorkspaceMenuOptions, workspaceMenu } from "./workspace-menu.ts";

const acme = { location: "/work/acme", name: "Acme" };
const beta = { location: "/work/beta", name: "Beta" };

function options(overrides: Partial<WorkspaceMenuOptions> = {}): WorkspaceMenuOptions {
  return {
    recent: [],
    open: [],
    shown: undefined,
    platform: "windows",
    onOpen: vi.fn(),
    onOpenFolder: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

/** The menu as text: headings in brackets, dividers as "—", items by label. */
function outline(entries: readonly MenuEntry[]): readonly string[] {
  return entries.map((entry) => {
    if (entry === "divider") {
      return "—";
    }
    return "heading" in entry ? `[${entry.heading}]` : entry.label;
  });
}

function item(entries: readonly MenuEntry[], label: string): MenuItem {
  const found = entries.find(
    (entry): entry is MenuItem => entry !== "divider" && "label" in entry && entry.label === label,
  );
  if (found === undefined) {
    throw new Error(`No item ${label}`);
  }
  return found;
}

verifies("workspace.workspace-menu", () => {
  it("starts at Open a folder… with no Recent and nothing open", () => {
    expect(outline(workspaceMenu(options()))).toEqual(["Open a folder…"]);
  });

  it("lists Recent first, then Open a folder…, then Close workspace", () => {
    const menu = workspaceMenu(
      options({ recent: [acme, beta], open: [acme.location], shown: acme.location }),
    );

    expect(outline(menu)).toEqual([
      "[Recent]",
      "Acme",
      "Beta",
      "—",
      "Open a folder…",
      "—",
      "Close workspace",
    ]);
  });

  it("shows each workspace's name over its folder and checks the shown one", () => {
    const menu = workspaceMenu(
      options({ recent: [acme, beta], open: [acme.location], shown: acme.location }),
    );

    expect(item(menu, "Acme")).toMatchObject({ detail: "/work/acme", checked: true });
    expect(item(menu, "Beta")).toMatchObject({ detail: "/work/beta", checked: false });
  });

  it("gives open workspaces their Ctrl number key (workspace.switcher.ctrl-number-keys)", () => {
    const open = [beta.location, acme.location];
    const windows = workspaceMenu(options({ recent: [acme, beta], open, shown: acme.location }));
    const macos = workspaceMenu(
      options({ recent: [acme, beta], open, shown: acme.location, platform: "macos" }),
    );

    expect(item(windows, "Beta").keys).toEqual(["Ctrl", "1"]);
    expect(item(windows, "Acme").keys).toEqual(["Ctrl", "2"]);
    expect(item(macos, "Beta").keys).toEqual(["⌘", "1"]);
  });

  it("gives a remembered workspace that isn't open no key", () => {
    const menu = workspaceMenu(options({ recent: [beta] }));

    expect(item(menu, "Beta").keys).toBeUndefined();
  });

  it("calls back with the row's folder, the picker or close", () => {
    const callbacks = options({ recent: [beta], open: [beta.location], shown: beta.location });
    const menu = workspaceMenu(callbacks);

    item(menu, "Beta").onSelect();
    item(menu, "Open a folder…").onSelect();
    item(menu, "Close workspace").onSelect();

    expect(callbacks.onOpen).toHaveBeenCalledWith("/work/beta");
    expect(callbacks.onOpenFolder).toHaveBeenCalledOnce();
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });
});
