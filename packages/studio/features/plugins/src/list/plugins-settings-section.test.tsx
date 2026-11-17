// @vitest-environment jsdom

import {
  createShell,
  type ItemRef,
  loadView,
  type SettingsSectionProps,
  type WorkspaceContext,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
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

    await act(async () =>
      document.querySelector<HTMLElement>('[aria-label="More actions for Weather"]')?.click(),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent?.trim() === "Open")
        ?.click(),
    );

    expect(closed).toBe(1);
    expect(opened).toEqual([{ kind: "plugin", hub: "this-computer", id: "weather" }]);
  });
});
