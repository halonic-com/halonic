// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import {
  createShell,
  type ItemRef,
  loadView,
  type SettingsSectionProps,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PluginsHostService } from "../api.ts";
import { pluginsFeature } from "../feature.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import {
  feedOf,
  noActions,
  noSettings,
  WorkspaceServices,
  weather,
} from "../test-support/plugins.ts";
import { installFakePopover } from "../test-support/popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";

// The section loads lazily. On a busy CI machine the first import (transforming the section, its
// dialogs and the kit behind them) can take longer than a test's own 5 s, and tests run in random
// order, so any test can be first. One that times out keeps running and leaves the next tests an
// empty page (HAL-11721). Do it up front under the hook's longer limit; each test then only waits
// for the already loaded section to draw.
beforeAll(async () => {
  await import("./plugins-settings-section.tsx");
}, 60_000);

/** Waits, inside act, until `read` finds the element, so a test never clicks before the UI settles. */
async function findElement<T extends Element>(read: () => T | null | undefined): Promise<T> {
  return vi.waitFor(
    async () => {
      await act(async () => {});
      const found = read();
      if (found === null || found === undefined) throw new Error("Not on screen yet");
      return found;
    },
    { timeout: 4_000, interval: 20 },
  );
}

let removePopover = () => {};
let toasts = createToastStore();
beforeEach(() => {
  toasts = createToastStore();
  fakeModal();
  removePopover = installFakePopover();
});
afterEach(() => {
  unmountAll();
  restoreModal();
  removePopover();
});

/** Settings → Plugins with an installer that adds Weather, which the feed already lists as not trusted. */
async function showAdding(trust: (plugin: string) => Promise<void>) {
  const { feed } = feedOf([weather("not-trusted")]);
  const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
  const workspace = new WorkspaceServices();
  workspace.provide(PluginsHostService, {
    feed,
    caller: { call: async () => "" },
    ...noSettings(),
    actions: { ...noActions().actions, trust },
    installer: { add: async () => ({ kind: "added", plugin: "weather" }) },
  });
  shell.services.instantiate(workspace);
  const opened: ItemRef[] = [];
  const context: WorkspaceContext = {
    ...shell.services.contextFor("plugins", workspace),
    openItem: (item) => opened.push(item),
  };
  const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
  if (section === undefined) throw new Error("No Plugins section");
  const View = await loadView<ComponentType<SettingsSectionProps>>(section);
  const events: string[] = [];
  render(
    <ToastStoreProvider store={toasts}>
      <View
        context={context}
        closeSettings={() => events.push("closed")}
        place="app"
        surface="window"
      />
    </ToastStoreProvider>,
  );
  const press = async (name: string, within: ParentNode = document) =>
    act(async () => {
      // A busy-capable button carries a hidden label too, so match the start; an exact match wins.
      const buttons = [...within.querySelectorAll<HTMLButtonElement>("button")];
      const found =
        buttons.find((candidate) => candidate.textContent?.trim() === name) ??
        buttons.find((candidate) => candidate.textContent?.startsWith(name) === true);
      if (found === undefined) throw new Error(`No button ${name}`);
      found.click();
    });
  await press("Add plugin");
  const input = document.querySelector<HTMLInputElement>("dialog input:not([type=radio])");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, "/plugins/weather");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const dialog = document.querySelector("dialog") ?? document;
  await press("Add", dialog);
  await act(async () => {});
  return { opened, events, press };
}

verifies("plugins.plugin-settings-list", () => {
  it("shows the installed plugins in Settings, and a row closes Settings and opens the page", async () => {
    const { feed } = feedOf([weather()]);
    const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
    const workspace = new WorkspaceServices();
    workspace.provide(PluginsHostService, {
      feed,
      caller: { call: async () => "" },
      ...noSettings(),
      ...noActions(),
    });
    shell.services.instantiate(workspace);
    const opened: ItemRef[] = [];
    const context: WorkspaceContext = {
      ...shell.services.contextFor("plugins", workspace),
      openItem: (item) => opened.push(item),
    };
    const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
    if (section === undefined) throw new Error("No Plugins section");
    const View = await loadView<ComponentType<SettingsSectionProps>>(section);
    let closed = 0;
    const view = render(
      <View
        context={context}
        closeSettings={() => {
          closed += 1;
        }}
        place="app"
        surface="window"
      />,
    );
    expect(view.textContent).toContain("Weather");
    // Under the section's own h3 "Plugins", as the other sections draw their groups (HAL-12536).
    const levels = [...view.querySelectorAll("h2, h3, h4, h5")].map(({ tagName }) => tagName);
    expect(levels).toEqual(["H4", "H4"]);

    const more = await findElement(() =>
      document.querySelector<HTMLElement>('[aria-label="More actions for Weather"]'),
    );
    await act(async () => more.click());
    const open = await findElement(() =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (item) => item.textContent?.trim() === "Open",
      ),
    );
    await act(async () => open.click());

    await vi.waitFor(() => expect(closed).toBe(1));
    expect(opened).toEqual([{ kind: "plugin", hub: "this-computer", id: "weather" }]);
  });

  it("puts its headings one level under the phone page's h1, with none installed", async () => {
    const { feed } = feedOf([]);
    const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
    const workspace = new WorkspaceServices();
    workspace.provide(PluginsHostService, {
      feed,
      caller: { call: async () => "" },
      ...noSettings(),
      ...noActions(),
    });
    shell.services.instantiate(workspace);
    const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
    if (section === undefined) throw new Error("No Plugins section");
    const View = await loadView<ComponentType<SettingsSectionProps>>(section);
    const view = render(
      <View
        context={shell.services.contextFor("plugins", workspace)}
        closeSettings={() => {}}
        place="app"
        surface="phone"
      />,
    );
    // Installed on this computer › No plugins yet, then Built in, under the page's h1 (HAL-13401).
    const levels = [...view.querySelectorAll("h2, h3, h4, h5")].map(({ tagName }) => tagName);
    expect(levels).toEqual(["H2", "H3", "H2"]);
  });

  it("opens the trust check at once when Add works, and Trust and turn on says it is on", async () => {
    const asked: string[] = [];
    const { opened, events, press } = await showAdding(async (plugin) => {
      asked.push(plugin);
    });
    const text = document.querySelector("dialog")?.textContent ?? "";
    expect(text).toContain("Trust Weather and turn it on?");
    expect(asked).toEqual([]);
    expect(opened).toEqual([]);
    await press("Trust and turn on");
    expect(asked).toEqual(["weather"]);
    expect(toasts.list().map((toast) => toast.title)).toEqual(["Weather is on"]);
    expect(events).toEqual(["closed"]);
    expect(opened).toEqual([{ kind: "plugin", hub: "this-computer", id: "weather" }]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("says the plugin is added but off on Not now, and trusts nothing", async () => {
    const asked: string[] = [];
    const { opened, press } = await showAdding(async (plugin) => {
      asked.push(plugin);
    });
    await press("Not now");
    expect(asked).toEqual([]);
    expect(toasts.list().map((toast) => [toast.title, toast.text])).toEqual([
      ["Weather is added but off", "Nothing from it runs until you trust it."],
    ]);
    expect(opened).toEqual([{ kind: "plugin", hub: "this-computer", id: "weather" }]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("hides Add plugin when the host gives no installer", async () => {
    const { feed } = feedOf([]);
    const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
    const workspace = new WorkspaceServices();
    workspace.provide(PluginsHostService, {
      feed,
      caller: { call: async () => "" },
      ...noSettings(),
      ...noActions(),
    });
    shell.services.instantiate(workspace);
    const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
    if (section === undefined) throw new Error("No Plugins section");
    const View = await loadView<ComponentType<SettingsSectionProps>>(section);
    const view = render(
      <View
        context={shell.services.contextFor("plugins", workspace)}
        closeSettings={() => {}}
        place="app"
        surface="window"
      />,
    );
    expect(view.textContent).not.toContain("Add plugin");
  });

  it("hides Add plugin when the host gives no installer, also with a plugin installed", async () => {
    const { feed } = feedOf([weather()]);
    const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
    const workspace = new WorkspaceServices();
    workspace.provide(PluginsHostService, {
      feed,
      caller: { call: async () => "" },
      ...noSettings(),
      ...noActions(),
    });
    shell.services.instantiate(workspace);
    const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
    if (section === undefined) throw new Error("No Plugins section");
    const View = await loadView<ComponentType<SettingsSectionProps>>(section);
    const view = render(
      <View
        context={shell.services.contextFor("plugins", workspace)}
        closeSettings={() => {}}
        place="app"
        surface="window"
      />,
    );
    expect(view.textContent).toContain("Weather");
    expect(view.textContent).not.toContain("Add plugin");
  });

  it("is view only in a served Settings, even with an installer and no host place", async () => {
    const { feed } = feedOf([weather()]);
    const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
    const workspace = new WorkspaceServices();
    workspace.provide(PluginsHostService, {
      feed,
      installer: { add: async () => ({ kind: "added", plugin: "weather" }) as never },
      caller: { call: async () => "" },
      ...noSettings(),
      ...noActions(),
    });
    shell.services.instantiate(workspace);
    const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
    if (section === undefined) throw new Error("No Plugins section");
    const View = await loadView<ComponentType<SettingsSectionProps>>(section);
    const view = render(
      <View
        context={shell.services.contextFor("plugins", workspace)}
        closeSettings={() => {}}
        place="served"
        surface="window"
      />,
    );
    await vi.waitFor(() => expect(view.textContent).toContain("Weather"));
    expect(view.textContent).toContain(
      "View only here. Add, trust and remove plugins on the computer that runs Halonic:",
    );
    expect(view.textContent).not.toContain("Add plugin");
  });
});

verifies("plugins.plugin-built-in", () => {
  async function showSettings(runCommand: WorkspaceContext["runCommand"]) {
    const { feed } = feedOf([]);
    const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
    const workspace = new WorkspaceServices();
    workspace.provide(PluginsHostService, {
      feed,
      caller: { call: async () => "" },
      ...noSettings(),
      ...noActions(),
    });
    shell.services.instantiate(workspace);
    const context: WorkspaceContext = {
      ...shell.services.contextFor("plugins", workspace),
      ...(runCommand === undefined ? {} : { runCommand }),
    };
    const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
    if (section === undefined) throw new Error("No Plugins section");
    const View = await loadView<ComponentType<SettingsSectionProps>>(section);
    const events: string[] = [];
    const view = render(
      <View
        context={context}
        closeSettings={() => events.push("closed")}
        place="app"
        surface="window"
      />,
    );
    return { view, events };
  }

  it("lists Gmail and Google Drive as built in, and Open closes Settings and runs the connectors command", async () => {
    const commands: string[] = [];
    const { view, events } = await showSettings((id) => {
      commands.push(id);
      return true;
    });
    expect(view.textContent).toContain("Gmail and Google Drive");
    expect(view.textContent).toContain("Comes with Halonic");
    expect(view.textContent).toContain("Built in");
    const more = await findElement(() =>
      document.querySelector<HTMLElement>('[aria-label="More actions for Gmail and Google Drive"]'),
    );
    await act(async () => more.click());
    const entries = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(entries.map((entry) => entry.textContent?.trim())).toEqual(["Open"]);
    await act(async () => entries[0]?.click());
    expect(events).toEqual(["closed"]);
    expect(commands).toEqual(["library.connector"]);
  });

  it("has no ⋮ on the row when the context can't run commands", async () => {
    const { view } = await showSettings(undefined);
    expect(view.textContent).toContain("Gmail and Google Drive");
    expect(
      document.querySelector('[aria-label="More actions for Gmail and Google Drive"]'),
    ).toBeNull();
  });
});
