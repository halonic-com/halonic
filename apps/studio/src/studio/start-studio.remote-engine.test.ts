// @vitest-environment jsdom

import { runExecutorVersion } from "@halonicjs/ports";
import { InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openFolder } from "./start-studio.ts";

const waitingRun = { id: "r2", status: "waiting", lastSeq: 3, accepts: [], approvals: [] };

/**
 * The desktop app's webview on an empty folder: Tauri's IPC, whose `engine_request` reaches an
 * engine when `withEngine`, and is refused as `engine_unavailable` otherwise. `commands` lists
 * every command the page called, with the route of each engine call.
 */
function desktopWebview(withEngine: boolean) {
  const commands: string[] = [];
  const engine = (route: string) => {
    if (!withEngine) throw { kind: "engine_unavailable", message: "no engine runs" };
    if (route === "GET /api/hello") return { status: 200, body: { runExecutorVersion } };
    if (route === "POST /api/runs") return { status: 201, body: { id: "r1", status: "running" } };
    return { status: 200, body: { runs: [waitingRun] } };
  };
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    if (command === "engine_request") {
      commands.push(`${command} ${String(args?.["route"])}`);
      return engine(String(args?.["route"]));
    }
    commands.push(command);
    if (command === "fs_write") return { status: "written" };
    if (command === "fs_list" || command === "run_logs") return [];
    if (command === "host_settings_read") return {};
    return null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { page: { __TAURI_INTERNALS__: internals }, commands };
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

verifies("studio.remote-engine", () => {
  it("starts runs and lists what waits through the shell's engine, and takes no engine lock", async () => {
    const webview = desktopWebview(true);
    const shell = createShell({ features: [], host: "desktop-app", platform: "linux" });
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    const host = opened.workspace.services.get(WorkflowsHostService);
    await expect(host.startRun?.({ hubId: "acme", id: "reply" }, {})).resolves.toEqual({
      runId: "r1",
    });
    await expect(opened.workspace.services.get(InboxRunsService).waiting()).resolves.toEqual([
      waitingRun,
    ]);

    expect(webview.commands.filter((command) => command.startsWith("engine_request"))).toEqual([
      "engine_request GET /api/hello",
      "engine_request POST /api/runs",
      "engine_request GET /api/waiting-runs",
    ]);
    expect(webview.commands).not.toContain("engine_lock_hold");
    await opened.dispose();
  });

  it("keeps the window's own engine when the shell has none", async () => {
    const webview = desktopWebview(false);
    const shell = createShell({ features: [], host: "desktop-app", platform: "linux" });
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    await expect(opened.workspace.services.get(InboxRunsService).waiting()).resolves.toEqual([]);

    expect(webview.commands.filter((command) => command.startsWith("engine_request"))).toEqual([
      "engine_request GET /api/hello",
    ]);
    expect(webview.commands).toContain("run_logs");
    await opened.dispose();
  });
});
