// @vitest-environment jsdom
import { HostSettings, ServiceRegistry } from "@halonicjs/app";
import { createShell, type ServiceKey, type SettingsSectionProps } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentSandboxSection } from "./agent-sandbox/agent-sandbox-section.tsx";
import {
  AgentSandboxService,
  type AssistantWorkspace,
  AssistantWorkspaceService,
  DisplaySettingsService,
  HostSettingsService,
  type UpdaterHost,
  UpdaterService,
} from "./api.ts";
import { AssistantSection } from "./assistant/assistant-section.tsx";
import { DisplaySettings } from "./display-settings.ts";
import { settingsFeature } from "./feature.ts";
import { FormatsSection } from "./formats/formats-section.tsx";
import { MemoryHostSettingsStore } from "./test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "./test-support/render.tsx";
import { AboutSection } from "./updater/about-section.tsx";

afterEach(unmountAll);

const displaySettings = new DisplaySettings({
  read: () => undefined,
  write: async () => undefined,
  subscribe: () => () => undefined,
});

/** The settings feature in a real shell, with the app giving only `provided` of the optional services. */
async function sectionContext(provided: readonly [ServiceKey<never>, unknown][]) {
  const shell = createShell({
    features: [settingsFeature],
    hostServices: [DisplaySettingsService, HostSettingsService, ...provided.map(([key]) => key)],
  });
  const hostSettings = new HostSettings(new MemoryHostSettingsStore());
  await hostSettings.load();
  const registry = new ServiceRegistry();
  registry.provide(DisplaySettingsService, displaySettings);
  registry.provide(HostSettingsService, hostSettings);
  for (const [key, service] of provided) {
    registry.provide(key as ServiceKey<unknown>, service);
  }
  shell.services.instantiate(registry);
  const base = shell.services.contextFor("settings", registry);
  return { ...base, openSettings: () => {} } as unknown as SettingsSectionProps["context"];
}

const neverSettles = <T,>() => new Promise<T>(() => {});

verifies("settings.feature", () => {
  it("reaches the updater the app provides, and says view-only without one", async () => {
    const host = {
      status: vi.fn(() => neverSettles()),
      subscribe: vi.fn(() => () => undefined),
    } as unknown as UpdaterHost;
    const withHost = await sectionContext([[UpdaterService as ServiceKey<never>, host]]);
    render(
      <AboutSection context={withHost} place="app" surface="window" closeSettings={() => {}} />,
    );
    expect(withHost.services.find(UpdaterService)).toBe(host);

    const without = await sectionContext([]);
    const view = render(
      <AboutSection context={without} place="app" surface="window" closeSettings={() => {}} />,
    );
    expect(view.textContent).toContain("Updates are installed on the computer running Halonic.");
    expect(without.services.find(UpdaterService)).toBeUndefined();
  });

  it("reaches the agent sandbox the app provides, and reads Not available without one", async () => {
    const check = vi.fn(() => neverSettles());
    const host = {
      available: true,
      check,
      running: () => neverSettles(),
    };
    const withHost = await sectionContext([[AgentSandboxService as ServiceKey<never>, host]]);
    render(
      <AgentSandboxSection
        context={withHost}
        place="app"
        surface="window"
        closeSettings={() => {}}
      />,
    );
    await act(async () => {});
    expect(check).toHaveBeenCalled();

    const without = await sectionContext([]);
    const view = render(
      <AgentSandboxSection
        context={without}
        place="app"
        surface="window"
        closeSettings={() => {}}
      />,
    );
    expect(view.textContent).toContain("Not available");
    expect(without.services.find(AgentSandboxService)).toBeUndefined();
  });

  it("reaches the workspace the app provides for the Assistant, and none without one", async () => {
    const current = vi.fn(() => null);
    const workspace: AssistantWorkspace = {
      current,
      subscribe: () => () => undefined,
      keyStored: async () => false,
    };
    const withHost = await sectionContext([
      [AssistantWorkspaceService as ServiceKey<never>, workspace],
    ]);
    render(
      <AssistantSection context={withHost} place="app" surface="window" closeSettings={() => {}} />,
    );
    expect(current).toHaveBeenCalled();

    const without = await sectionContext([]);
    render(
      <AssistantSection context={without} place="app" surface="window" closeSettings={() => {}} />,
    );
    expect(without.services.find(AssistantWorkspaceService)).toBeUndefined();
  });

  it("still fails for a service the settings feature doesn't list", async () => {
    const context = await sectionContext([]);
    const stranger = { name: "settings.stranger" } as ServiceKey<unknown>;
    expect(() => context.services.find(stranger)).toThrow("doesn't list it in needs or wants");
    expect(() => context.services.get(stranger)).toThrow("doesn't list it in needs or wants");
  });
});

verifies("settings.formats-section", () => {
  it("follows the system's region format the shell passes, not the window's language", async () => {
    const context = await sectionContext([]);
    const view = render(
      <FormatsSection
        context={context}
        place="app"
        surface="window"
        closeSettings={() => {}}
        regionFormat="nl-NL"
      />,
    );
    expect(view.textContent).toContain("Follow this computer: Dutch (Netherlands)");
    expect(view.textContent).toContain("45,00");
  });
});
