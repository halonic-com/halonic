// @vitest-environment jsdom

import { workspaceFilesKey } from "@halonicjs/app";
import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openFolder } from "./start-studio.ts";

/** The desktop app's webview: Tauri's IPC, answering the shell's file calls with an empty folder. */
function desktopWebview() {
  const invoke = async (command: string, _args?: Record<string, unknown>) => {
    if (command === "fs_write") return { status: "written" };
    if (command === "fs_list") return [];
    if (command === "host_settings_read") return {};
    return command === "run_logs" ? [] : null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { page: { __TAURI_INTERNALS__: internals } };
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

verifies("studio.entry", () => {
  it("makes Run's save through the save note, and a failed one has its toast and stops the run", async () => {
    const webview = desktopWebview();
    const internals = webview.page.__TAURI_INTERNALS__;
    const invoke = internals.invoke;
    internals.invoke = async (command: string, args?: Record<string, unknown>) => {
      if (command === "fs_write") throw Object.assign(new Error("EACCES: no"), { code: "EACCES" });
      return invoke(command, args);
    };
    const shell = createShell({ features: [], host: "desktop-app", platform: "windows" });
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());
    opened.workspace.services.get(workspaceFilesKey).change("Added a note", { "note.txt": "hi" });

    const host = opened.workspace.services.get(WorkflowsHostService);
    await expect(host.startRun?.({ hubId: "acme", id: "reply" }, {})).rejects.toThrow(
      "The workspace couldn't be saved.",
    );

    expect(opened.workspace.saving.note).toMatchObject({ kind: "failed" });
    expect(shell.toasts.list()).toEqual([
      expect.objectContaining({
        tone: "danger",
        action: expect.objectContaining({ label: "Try again" }),
      }),
    ]);
    await opened.dispose();
  });
});
