// @vitest-environment jsdom

import { runExecutorVersion } from "@halonicjs/ports";
import { InboxRunsService } from "@halonicjs/studio-feature-inbox/api";
import { BrowserDisplayPrefs, DisplaySettings } from "@halonicjs/studio-feature-settings";
import { WorkflowsHostService } from "@halonicjs/studio-feature-workflows/api";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { openFolder } from "./open-folder.ts";

const waitingRun = { id: "r2", status: "waiting", lastSeq: 3, accepts: [], approvals: [] };

/**
 * The desktop app's webview on an empty folder, whose shell answers `engine_open` only when the
 * test calls `engineUp`, as a background engine that is still starting. `engineCalls` lists the
 * route of every engine call the page made.
 */
function startingEngineWebview(withEngine = true) {
  const engineCalls: string[] = [];
  let engineUp = (): void => {};
  const engineOpen = new Promise<null>((resolve) => {
    engineUp = () => resolve(null);
  });
  const engine = (route: string) => {
    engineCalls.push(route);
    if (!withEngine) throw { kind: "engine_unavailable", message: "no engine runs" };
    if (route === "GET /api/hello") return { status: 200, body: { runExecutorVersion } };
    if (route === "POST /api/runs") return { status: 201, body: { id: "r1", status: "running" } };
    return { status: 200, body: { runs: [waitingRun] } };
  };
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    if (command === "engine_open") return engineOpen;
    if (command === "engine_request") return engine(String(args?.["route"]));
    if (command === "fs_write") return { status: "written" };
    if (command === "fs_list" || command === "run_logs") return [];
    if (command === "host_settings_read") return {};
    return null;
  };
  const internals = { invoke, transformCallback: () => 1, unregisterCallback: () => {} };
  return { page: { __TAURI_INTERNALS__: internals }, engineCalls, engineUp: () => engineUp() };
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

/** Lets the shell's answers that are already in reach land. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

verifies("studio.open-folder-before-engine", () => {
  it("shows the workspace while the engine starts, and attaches the engine when it answers", async () => {
    const webview = startingEngineWebview();
    const shell = createShell({ features: [], host: "desktop-app", platform: "linux" });

    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    expect(opened.workspace.name).toBe("acme");
    expect(shell.engine.connection).toBe("starting");
    expect(webview.engineCalls).toEqual([]);

    webview.engineUp();
    await expect(opened.workspace.services.get(InboxRunsService).waiting()).resolves.toEqual([
      waitingRun,
    ]);
    expect(shell.engine.connection).toBe("connected");
    expect(webview.engineCalls).toEqual(["GET /api/hello", "GET /api/waiting-runs"]);
    await opened.dispose();
  });

  it("starts no run before the engine answers, and starts it on that engine once it does", async () => {
    const webview = startingEngineWebview();
    const shell = createShell({ features: [], host: "desktop-app", platform: "linux" });
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    const host = opened.workspace.services.get(WorkflowsHostService);
    const started = host.startRun?.({ hubId: "acme", id: "reply" }, {});
    await settle();
    expect(webview.engineCalls).toEqual([]);

    webview.engineUp();
    await expect(started).resolves.toEqual({ runId: "r1" });
    expect(webview.engineCalls).toEqual(["GET /api/hello", "POST /api/runs"]);
    await opened.dispose();
  });

  it("reads what waits from the run logs when the shell has no engine for the folder", async () => {
    const webview = startingEngineWebview(false);
    const shell = createShell({ features: [], host: "desktop-app", platform: "linux" });
    const opened = await openFolder(shell, webview.page, "/work/acme", displaySettings());

    webview.engineUp();
    await expect(opened.workspace.services.get(InboxRunsService).waiting()).resolves.toEqual([]);
    expect(shell.engine.connection).toBe("connected");
    expect(webview.engineCalls).toEqual(["GET /api/hello"]);
    await opened.dispose();
  });
});
