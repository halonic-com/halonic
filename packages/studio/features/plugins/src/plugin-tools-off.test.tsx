// @vitest-environment jsdom

import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import {
  createShell,
  type HomeCardProps,
  loadView,
  type SettingsSectionProps,
} from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ComponentType } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginsHostService } from "./api.ts";
import { pluginsFeature } from "./feature.ts";
import type { PluginsHost } from "./plugins-service.ts";
import { fakeModal, restoreModal } from "./test-support/modal.ts";
import {
  feedOf,
  noActions,
  noSettings,
  WorkspaceServices,
  weather,
} from "./test-support/plugins.ts";
import { render, unmountAll } from "./test-support/render.tsx";
import { NO_PLUGIN_TOOLS_LINE } from "./tools-in-build.ts";

// The views load lazily; load them up front under the hook's longer limit (HAL-11721).
beforeAll(async () => {
  await import("./list/plugins-settings-section.tsx");
  await import("./cards/plugin-home-cards-view.tsx");
}, 60_000);

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

/** A Studio with the Weather plugin on, whose app answers `inThisBuild` when asked. */
async function studioWhere(toolsInThisBuild: PluginsHost["toolsInThisBuild"]) {
  const { feed } = feedOf([weather()]);
  const call = vi.fn(async () => "Sunny");
  const shell = createShell({ features: [pluginsFeature], hostServices: [PluginsHostService] });
  const workspace = new WorkspaceServices();
  workspace.provide(PluginsHostService, {
    feed,
    caller: { call },
    ...noSettings(),
    ...noActions(),
    ...(toolsInThisBuild === undefined ? {} : { toolsInThisBuild }),
  });
  shell.services.instantiate(workspace);
  const context = shell.services.contextFor("plugins", workspace);
  // Lets the app's answer arrive.
  await act(async () => {});
  const commands = () =>
    shell.contributions.commands
      .list(() => context)
      .filter(({ id }) => id.startsWith("plugins.commands."));
  const showHome = async () => {
    const [cards] = shell.contributions.home.cards();
    if (cards === undefined) throw new Error("No Cards section");
    const Cards = await loadView<ComponentType<HomeCardProps>>(cards);
    return render(<Cards context={context} attempt={0} />);
  };
  const showSettings = async () => {
    const section = shell.contributions.settings.list().find(({ id }) => id === "plugins");
    if (section === undefined) throw new Error("No Plugins section");
    const View = await loadView<ComponentType<SettingsSectionProps>>(section);
    return render(
      <ToastStoreProvider store={createToastStore()}>
        <View context={context} closeSettings={() => {}} place="app" surface="window" />
      </ToastStoreProvider>,
    );
  };
  return { commands, showHome, showSettings, call };
}

/** How many times `text` shows in `view`. */
function timesIn(view: HTMLElement, text: string): number {
  return (view.textContent ?? "").split(text).length - 1;
}

verifies("plugins.plugin-tools-off", () => {
  describe("a build without plugin tools", () => {
    const off = async () => false;

    it("gives no plugin commands in Ctrl K", async () => {
      const { commands } = await studioWhere(off);

      expect(commands()).toEqual([]);
    });

    it("shows no plugin cards on Home and calls no tool", async () => {
      const { showHome, call } = await studioWhere(off);

      const home = await showHome();
      await act(async () => {});

      expect(home.textContent).not.toContain("Today's weather");
      expect(home.textContent).not.toContain(NO_PLUGIN_TOOLS_LINE);
      expect(call).not.toHaveBeenCalled();
    });

    it("says it once on the Plugins page, above the plugins", async () => {
      const { showSettings } = await studioWhere(off);

      const page = await showSettings();

      expect(NO_PLUGIN_TOOLS_LINE).toBe("Plugin tools aren't in this build of Halonic yet.");
      expect(timesIn(page, NO_PLUGIN_TOOLS_LINE)).toBe(1);
      expect(page.textContent).toContain("Weather");
    });
  });

  describe("a build with plugin tools", () => {
    for (const [name, ask] of [
      ["that says so", async () => true],
      ["that can't say", async () => Promise.reject(new Error("host unreachable"))],
      ["that isn't asked", undefined],
    ] as const) {
      it(`shows cards and commands, and no line, for an app ${name}`, async () => {
        const { commands, showHome, showSettings } = await studioWhere(ask);

        expect(commands().map(({ id }) => id)).toEqual(["plugins.commands.weather.forecast"]);
        const home = await showHome();
        await act(async () => {});
        expect(home.textContent).toContain("Today's weather");
        expect(timesIn(await showSettings(), NO_PLUGIN_TOOLS_LINE)).toBe(0);
      });
    }
  });
});
