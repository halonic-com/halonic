// @vitest-environment jsdom

import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import {
  type OpenedWorkspace,
  RecentWorkspaces,
  WorkspaceSwitcher,
} from "@halonicjs/studio-feature-workspace";
import { createShell } from "@halonicjs/studio-shell";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openFolder } from "./start-studio.ts";

/** The demo's files: `default` on the test model, as the bundled Acme ships. */
const demoFiles: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "models.yaml": "version: 1\naliases:\n  default:\n    provider: mock\n    model: echo\n",
  "providers/mock.yaml": "version: 1\ntype: mock\n",
};

/** The desktop app's webview: Tauri's IPC, answering the shell's file calls with the demo's files. */
function desktopWebview() {
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    if (command === "fs_read") return demoFiles[String(args?.["path"])] ?? null;
    if (command === "fs_list") return Object.keys(demoFiles);
    if (command === "fs_write") return { status: "written" };
    if (command === "host_settings_read") return {};
    return command === "run_logs" ? [] : null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { page: { __TAURI_INTERNALS__: internals } };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function displaySettings(): DisplaySettings {
  return new DisplaySettings(new BrowserDisplayPrefs(memoryStorage(), new EventTarget()));
}

verifies("studio.try-sample", () => {
  it("shows Sample answers on a demo just made, which Recent learns only after the folder opens", async () => {
    const webview = desktopWebview();
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const storage = memoryStorage();
    const recent = new RecentWorkspaces(storage);
    const opened: OpenedWorkspace[] = [];
    const switcher = new WorkspaceSwitcher({
      pickFolder: async () => undefined,
      openFolder: async (location) => {
        const workspace = await openFolder(shell, webview.page, location, displaySettings(), {
          recent,
          storage,
        });
        opened.push(workspace);
        return workspace;
      },
      recent,
      toasts: shell.toasts,
    });

    await switcher.openLocation("/docs/Acme sample", "Created Acme sample", true);

    const testModel = opened[0]?.testModel;
    expect(testModel).toBeDefined();
    const stop = testModel?.subscribe(() => {});
    await waitUntil("the demo's default model to read as the test model", () =>
      Boolean(testModel?.onTestModel),
    );
    expect(testModel?.onTestModel).toBe(true);
    stop?.();
    await Promise.all(opened.map((workspace) => workspace.dispose()));
  });
});
