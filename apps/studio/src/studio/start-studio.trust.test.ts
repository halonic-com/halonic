// @vitest-environment jsdom

import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { WorkspacePageService } from "@halonicjs/studio-feature-workspace/api";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openFolder } from "./start-studio.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/** Display settings over storage of their own, as the desktop app makes one per window. */
function displaySettings(): DisplaySettings {
  return new DisplaySettings(new BrowserDisplayPrefs(memoryStorage(), new EventTarget()));
}

const acmeSettings = "id: acme\nname: Acme\n";

verifies("studio.workspace-trust", () => {
  it("names an opened workspace from workspace.yaml, and does not trust it until a person does", async () => {
    const calls: string[] = [];
    const answers: Record<string, unknown> = {
      fs_list: ["workspace.yaml"],
      folder_location: "/work/acme",
      folder_entries: [],
      host_settings_read: {},
    };
    const invoke = async (command: string, args?: Record<string, unknown>) => {
      calls.push(command);
      if (command === "fs_read") return args?.["path"] === "workspace.yaml" ? acmeSettings : null;
      return answers[command] ?? null;
    };
    const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });

    const opened = await openFolder(
      shell,
      { __TAURI_INTERNALS__: internals },
      "/work/acme",
      displaySettings(),
    );

    expect(opened.name).toBe("Acme");
    expect(calls).toContain("trust_get");
    await opened.dispose();
  });

  it("tells the workspace page the name and the trust control of the folder", async () => {
    const answers: Record<string, unknown> = {
      fs_list: ["workspace.yaml"],
      folder_location: "/work/acme",
      folder_entries: [],
      host_settings_read: {},
    };
    const invoke = async (command: string, args?: Record<string, unknown>) => {
      if (command === "fs_read") return args?.["path"] === "workspace.yaml" ? acmeSettings : null;
      return answers[command] ?? null;
    };
    const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
    const shell = createShell({
      features: [],
      hostServices: [WorkspacePageService],
      host: "desktop-app",
      platform: "windows",
    });

    const opened = await openFolder(
      shell,
      { __TAURI_INTERNALS__: internals },
      "/work/acme",
      displaySettings(),
    );

    const page = opened.workspace.services.get(WorkspacePageService);
    expect(page.name).toBe("Acme");
    expect(page.trust).toBe(opened.trust);
    await opened.dispose();
  });
});
