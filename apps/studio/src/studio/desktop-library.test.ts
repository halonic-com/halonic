// @vitest-environment jsdom

import {
  ConnectorStatusHostService,
  ListedToolsHostService,
} from "@halonicjs/studio-feature-library/api";
import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { desktopFeatures, openFolder } from "./start-studio.ts";

const acmeSettings = "id: acme\nname: Acme\n";

/** Display settings over storage of their own, as the desktop app makes one per window. */
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

verifies("studio.workspace-connector-status", () => {
  it("registers the Library in the desktop app", () => {
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    expect(shell.features.map((feature) => feature.id)).toContain("library");
  });

  it("gives an opened folder's connectors to the Library", async () => {
    const connectorPath = "library/connectors/search.connector.yaml";
    const connector = [
      "version: 1",
      "id: search",
      "name: Web search",
      "transport: { http: { url: https://search.acme.example/mcp } }",
    ].join("\n");
    const answers: Record<string, unknown> = {
      fs_list: ["workspace.yaml", connectorPath],
      folder_location: "/work/acme",
      folder_entries: [],
      host_settings_read: {},
    };
    const invoke = async (command: string, args?: Record<string, unknown>) => {
      if (command === "fs_read") {
        if (args?.["path"] === "workspace.yaml") return acmeSettings;
        return args?.["path"] === connectorPath ? connector : null;
      }
      return answers[command] ?? null;
    };
    const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });

    const opened = await openFolder(
      shell,
      { __TAURI_INTERNALS__: internals },
      "/work/acme",
      displaySettings(),
    );

    const status = opened.workspace.services.get(ConnectorStatusHostService);
    expect((await status.list()).map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "search", name: "Web search" },
    ]);
    await opened.dispose();
  });
});

verifies("studio.workspace-listed-tools", () => {
  it("gives an opened folder's connector review to the Library, which starts nothing in an untrusted folder", async () => {
    const connectorPath = "library/connectors/notes.connector.yaml";
    const connector = [
      "version: 1",
      "id: notes",
      "transport: { stdio: { command: notes-server } }",
    ].join("\n");
    const started: string[] = [];
    const answers: Record<string, unknown> = {
      fs_list: ["workspace.yaml", connectorPath],
      folder_location: "/work/acme",
      folder_entries: [],
      host_settings_read: {},
      // The shell answers the program search, so the review reaches the trust check.
      command_paths: {},
    };
    const invoke = async (command: string, args?: Record<string, unknown>) => {
      if (command.startsWith("agent_host")) started.push(command);
      if (command === "fs_read") {
        if (args?.["path"] === "workspace.yaml") return acmeSettings;
        return args?.["path"] === connectorPath ? connector : null;
      }
      return answers[command] ?? null;
    };
    const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
    const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });
    const opened = await openFolder(
      shell,
      { __TAURI_INTERNALS__: internals },
      "/work/acme",
      displaySettings(),
    );

    const tools = opened.workspace.services.get(ListedToolsHostService);

    await expect(tools.review("notes")).rejects.toThrow(/isn't trusted/);
    expect(started).toEqual([]);
    await opened.dispose();
  });
});
