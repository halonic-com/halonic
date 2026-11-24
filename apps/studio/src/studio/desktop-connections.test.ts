import { ServiceRegistry } from "@halonicjs/app";
import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { AgentConnectionsService } from "@halonicjs/studio-services";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { provideAgentConnections } from "../inbox/provide-agent-connections.ts";
import { desktopFeatures } from "./desktop-features.ts";
import { openFolder } from "./start-studio.ts";

const answers: Record<string, unknown> = {
  fs_list: ["workspace.yaml"],
  folder_location: "/work/acme",
  folder_entries: [],
  host_settings_read: {},
  plugin_folder_entries: [],
};

/** A desktop page with the shell's commands, as Tauri gives it; nothing answers beyond `answers`. */
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

function connectionsSection(shell: ReturnType<typeof createShell>) {
  return shell.contributions.settings.list().find(({ id }) => id === "connections");
}

verifies("studio.desktop-connections", () => {
  it("has Settings › Connections in the desktop app", () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    expect(connectionsSection(shell)?.title).toBe("Connections");
  });

  it("gives a folder opened with the agent host the connections Settings › Connections reads", async () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    const opened = await openFolder(shell, acmeWebview(), "/work/acme", displaySettings());

    expect(opened.workspace.services.has(AgentConnectionsService)).toBe(true);
    await opened.dispose();
  });

  it("gives a page without the agent host no connections", () => {
    const services = new ServiceRegistry();

    provideAgentConnections(services, undefined, "/work/acme");

    expect(services.has(AgentConnectionsService)).toBe(false);
  });
});
