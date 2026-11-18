// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { PluginActions } from "../page/plugin-actions.ts";
import type { InstalledPlugin } from "../page/plugin-pages.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { noActions, weather } from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PluginsList, type PluginsLoad } from "./plugins-list.tsx";

let removePopover = () => {};
beforeEach(() => {
  fakeModal();
  removePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restoreModal();
  removePopover();
});

const now = () => new Date(2026, 10, 12);

function described(plugin: InstalledPlugin): InstalledPlugin {
  if (plugin.manifest === undefined) return plugin;
  return {
    ...plugin,
    manifest: { ...plugin.manifest, description: "The forecast where you are." },
  };
}

interface Seen {
  readonly opened: string[];
  readonly tabs: string[];
  readonly builtIns: string[];
  readonly calls: string[];
}

function show(
  plugins: readonly InstalledPlugin[],
  options: {
    load?: PluginsLoad;
    actions?: PluginActions;
    builtIn?: boolean;
    openBuiltIn?: boolean;
    phone?: boolean;
    noAdd?: boolean;
    place?: "app" | "served";
  } = {},
): Seen {
  const seen: Seen = { opened: [], tabs: [], builtIns: [], calls: [] };
  render(
    <PresentationProvider presentation={options.phone === true ? "phone" : "desktop"}>
      <PluginsList
        place={options.place ?? "app"}
        load={options.load ?? { kind: "ready" }}
        plugins={plugins}
        builtIn={options.builtIn === false ? [] : [{ id: "gmail", name: "Gmail" }]}
        actions={options.actions ?? noActions().actions}
        onOpen={(id) => seen.opened.push(id)}
        onOpenInNewTab={(id) => seen.tabs.push(id)}
        {...(options.openBuiltIn === false
          ? {}
          : { onOpenBuiltIn: (id: string) => seen.builtIns.push(id) })}
        {...(options.noAdd === true ? {} : { onAdd: () => seen.calls.push("add") })}
        onRetry={() => seen.calls.push("retry")}
        now={now}
      />
    </PresentationProvider>,
  );
  return seen;
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) =>
      candidate.textContent?.trim().startsWith(name) === true ||
      candidate.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`No button ${name}`);
  return found;
}

async function pick(name: string) {
  await act(async () => button(name).click());
}

async function openMenu(plugin: string) {
  await pick(`More actions for ${plugin}`);
}

function items(): string[] {
  return [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
    (item.textContent ?? "").trim(),
  );
}

async function choose(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (item === undefined) throw new Error(`No menu item ${label}`);
  await act(async () => item.click());
}

const text = () => document.body.textContent ?? "";

verifies("plugins.plugin-list", () => {
  it("is view only on a phone: the line, the command, no Add plugin, and a ⋮ that only opens", async () => {
    show([weather()], { phone: true });
    expect(text()).toContain(
      "View only on a phone. Add, trust and remove plugins on your computer:",
    );
    expect(text()).toContain("halonic plugin add <folder or git address>");
    expect(document.body.textContent).not.toContain("Add plugin");
    await openMenu("Weather");
    expect(items()).toEqual(["Open", "Open in new tab"]);
  });

  it("is view only in a served browser, naming the computer that runs Halonic", () => {
    show([], { place: "served" });
    expect(text()).toContain(
      "View only here. Add, trust and remove plugins on the computer that runs Halonic:",
    );
    expect(text()).toContain("No plugins yet");
    expect(text()).not.toContain("Add plugin");
  });

  it("shows no view-only line on this computer", () => {
    show([weather()]);
    expect(text()).not.toContain("View only");
    expect(text()).toContain("Add plugin");
  });

  it("shows the sentence, the sections and a row with what it adds, its version and trust date", () => {
    show([described(weather())]);
    // The sentence is the section's registered description, which the container draws.
    expect(text()).not.toContain("Plugins add services");
    expect(text()).toContain("Installed on this computer");
    expect(text()).toContain("Built in");
    expect(text()).toContain("Weather");
    expect(text()).toContain(
      "“The forecast where you are.” · 1 tool · 1 command · 1 card · a panel",
    );
    expect(text()).toContain("1.2.0 · trusted 3 Nov");
  });

  it("marks a plugin that isn't trusted, one that changed and one that can't load", () => {
    const broken: InstalledPlugin = {
      plugin: "broken",
      name: "broken",
      status: "cant-load",
      commands: [],
      cards: [],
      panel: undefined,
      problems: [
        { file: "plugin.yaml", path: ["ui", "commands", 0, "tool"], message: "send_email sends." },
        { file: "plugin.yaml", path: [], message: "Second." },
      ],
    };
    show([weather("not-trusted"), { ...weather("changed"), plugin: "w2", name: "W2" }, broken]);
    expect(text()).toContain("Not trusted yet");
    expect(text()).toContain("Changed since you trusted it");
    expect(text()).toContain("2 errors");
    expect(text()).toContain("send_email sends.");
  });

  it("gives a built-in plugin the chip and only Open", async () => {
    const seen = show([weather()]);
    expect(text()).toContain("Comes with Halonic");
    const chips = [...document.querySelectorAll("span")].filter(
      (node) =>
        node.closest("h2, h3, h4") === null &&
        node.children.length === 0 &&
        node.textContent?.trim() === "Built in",
    );
    expect(chips).toHaveLength(1);
    await openMenu("Gmail");
    expect(items()).toEqual(["Open"]);
    await choose("Open");
    expect(seen.builtIns).toEqual(["gmail"]);
  });

  it("offers the ⋮ items, and Remove trust only while it is trusted", async () => {
    const seen = show([weather(), { ...weather("not-trusted"), plugin: "w2", name: "W2" }]);
    await openMenu("Weather");
    expect(items()).toEqual([
      "Open",
      "Open in new tab",
      "Open folder",
      "Remove trust",
      "Remove plugin…",
    ]);
    await choose("Open in new tab");
    expect(seen.tabs).toEqual(["weather"]);
    await openMenu("W2");
    expect(items()).not.toContain("Remove trust");
  });

  it("asks before removing, then asks the app to remove the plugin", async () => {
    const asked: string[] = [];
    const actions: PluginActions = {
      ...noActions().actions,
      remove: async (plugin) => {
        asked.push(plugin);
        return { kind: "removed" };
      },
    };
    show([weather()], { actions });
    await openMenu("Weather");
    await choose("Remove plugin…");
    expect(asked).toEqual([]);
    expect(document.querySelector("dialog")?.textContent).toContain("Remove Weather?");
    await pick("Remove plugin");
    expect(asked).toEqual(["weather"]);
  });

  it("says No plugins yet with Add plugin, and Add plugin asks for the dialog", async () => {
    const seen = show([]);
    expect(text()).toContain("No plugins yet");
    await act(async () => {
      for (const candidate of document.querySelectorAll("button")) {
        if (candidate.textContent === "Add plugin") candidate.click();
      }
    });
    expect(seen.calls).toEqual(["add"]);
    const labels = [...document.querySelectorAll("button")].filter(
      (candidate) => candidate.textContent === "Add plugin",
    );
    expect(labels).toHaveLength(1);
  });

  it("opens nothing on a built-in row, and gives it no ⋮, when the host can't open one", () => {
    const seen = show([weather()], { openBuiltIn: false });
    expect(text()).toContain("Gmail");
    expect(document.querySelector('button[aria-label*="Gmail"]')).toBeNull();
    expect(seen.builtIns).toEqual([]);
  });

  it("makes a built-in row with no opener inert: Enter and a click do nothing", async () => {
    const seen = show([weather()], { openBuiltIn: false });
    const row = [...document.querySelectorAll('[role="gridcell"]')].find((candidate) =>
      candidate.textContent?.includes("Gmail"),
    );
    expect(row).toBeDefined();
    const keydown = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    await act(async () => {
      row?.dispatchEvent(keydown);
      (row as HTMLElement | undefined)?.click();
    });
    expect(keydown.defaultPrevented).toBe(false);
    expect(seen.builtIns).toEqual([]);
    expect(seen.opened).toEqual([]);
  });

  it("says why it couldn't load, with Try again", async () => {
    const seen = show([], { load: { kind: "failed", reason: "The folder is locked." } });
    expect(text()).toContain("Couldn't load your plugins");
    expect(text()).toContain("The folder is locked.");
    expect(text()).toContain("Built in");
    expect(text()).toContain("Gmail");
    await pick("Try again");
    expect(seen.calls).toEqual(["retry"]);
  });

  it("never draws a plugin's name as HTML", () => {
    const hostile = { ...weather(), name: "<img src=x onerror=alert(1)>" };
    show([hostile]);
    expect(text()).toContain("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
  });
});

verifies("plugins.plugin-list-no-installer", () => {
  it("shows the command line instead of a missing Add plugin when the app has no installer", () => {
    show([], { noAdd: true });
    expect(text()).toContain("No plugins yet");
    expect(text()).not.toContain("Add plugin");
    expect(text()).toContain("Studio can't add a plugin yet.");
    expect(text()).toContain("halonic plugin add <folder or git address>");
  });
});
