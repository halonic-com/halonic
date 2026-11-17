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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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

// The first test lazy-loads the view and the feature graph, which takes longer than the 5 s default
// on a loaded runner.
vi.setConfig({ testTimeout: 30_000 });

/** Waits, inside act, until `read` finds the element, so a test never clicks before the UI settles. */
async function findElement<T extends Element>(read: () => T | null | undefined): Promise<T> {
  return vi.waitFor(
    async () => {
      await act(async () => {});
      const found = read();
      if (found === null || found === undefined) throw new Error("Not on screen yet");
      return found;
    },
    { timeout: 10_000, interval: 20 },
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
      found?.click();
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
