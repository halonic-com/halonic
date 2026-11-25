// @vitest-environment jsdom
import { HostSettings } from "@halonicjs/app";
import { createShell } from "@halonicjs/studio-shell";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSandboxHostView } from "./agent-sandbox/agent-sandbox-section.tsx";
import type { AgentSandboxHost } from "./api.ts";
import { DisplaySettingsService, HostSettingsService } from "./api.ts";
import { AppearanceView } from "./appearance/appearance-section.tsx";
import { DisplaySettings } from "./display-settings.ts";
import { settingsFeature } from "./feature.ts";
import { MemoryDisplayPrefs } from "./test-support/memory-display-prefs.ts";
import { MemoryHostSettingsStore } from "./test-support/memory-host-settings-store.ts";
import { render, unmountAll } from "./test-support/render.tsx";

afterEach(unmountAll);

const readyHost: AgentSandboxHost = {
  available: true,
  check: async () => ({ state: "ready", checkedAt: "1970-01-01T00:00:00.000Z" }),
  running: async () => null,
  setUp: async () => null,
  remove: async () => null,
  follow: async () => null,
};

// The board hid these until they work (HAL-12643): each saves a choice nothing uses yet.
describe("the settings hidden until they work", () => {
  it("leaves out the Assistant section", () => {
    const shell = createShell({
      features: [settingsFeature],
      hostServices: [DisplaySettingsService, HostSettingsService],
    });
    const ids = shell.contributions.settings.list().map((section) => section.id);
    expect(ids).toContain("agent-sandbox");
    expect(ids).not.toContain("assistant");
  });

  it("leaves out Panel opacity and Agent characters from Appearance", () => {
    const settings = new DisplaySettings(new MemoryDisplayPrefs());
    const view = render(<AppearanceView settings={settings} announce={() => {}} />);
    expect(view.textContent).toContain("Theme");
    expect(view.textContent).not.toContain("Panel opacity");
    expect(view.querySelector('[type="range"]')).toBeNull();
    expect(view.textContent).not.toContain("Agent characters");
    expect(view.querySelector('[role="switch"]')).toBeNull();
  });

  it("leaves out New agents run from Agent sandbox, even with its settings loaded", async () => {
    const settings = new HostSettings(new MemoryHostSettingsStore());
    await settings.load();
    const view = render(
      <AgentSandboxHostView host={readyHost} place="app" settings={settings} announce={() => {}} />,
    );
    await act(async () => {});
    expect(view.textContent).toContain("Remove the sandbox");
    expect(view.textContent).not.toContain("New agents run");
    expect(view.querySelector("select")).toBeNull();
  });
});
