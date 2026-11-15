import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopFeatures, openFolder } from "./start-studio.ts";

const answers: Record<string, unknown> = {
  fs_list: ["workspace.yaml"],
  folder_location: "/work/acme",
  folder_entries: [],
  host_settings_read: {},
  plugin_folder_entries: [],
};

function acmeWebview() {
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    if (command === "fs_read") {
      return args?.["path"] === "workspace.yaml" ? "id: acme\nname: Acme\n" : null;
    }
    return answers[command] ?? null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { __TAURI_INTERNALS__: internals };
}

function displaySettings(): DisplaySettings {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  return new DisplaySettings(new BrowserDisplayPrefs(storage, new EventTarget()));
}

verifies("studio.desktop-plugins-registered", () => {
  it("registers the plugins feature in the desktop app", () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    expect(shell.features.map((feature) => feature.id)).toContain("plugins");
  });

  it("gives an opened folder the plugins host, the same one for every folder of the window", async () => {
    const shell = createShell({
      features: [],
      hostServices: [PluginsHostService],
      host: "desktop-app",
      platform: "windows",
    });
    const page = acmeWebview();

    const first = await openFolder(shell, page, "/work/acme", displaySettings());
    const second = await openFolder(shell, page, "/work/acme", displaySettings());

    expect(first.workspace.services.get(PluginsHostService)).toBe(
      second.workspace.services.get(PluginsHostService),
    );
    await first.dispose();
    await second.dispose();
  });
});
