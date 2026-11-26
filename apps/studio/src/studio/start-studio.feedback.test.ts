// @vitest-environment jsdom

import { ServiceRegistry } from "@halonicjs/app";
import { type OpenedWorkspace, RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import {
  type AgentConnection,
  type AgentConnections,
  AgentConnectionsService,
  tauriIpc,
} from "@halonicjs/studio-services";
import { createShell, type Shell, StudioWorkspace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { desktopFeatures } from "./desktop-features.ts";
import { focusedAppOf, startFocusedApp } from "./start-focused-app.ts";
import { displaySettingsOf, type StartedStudio, startStudio } from "./start-studio.ts";

/** The desktop app's webview in the window the shell labelled `label`, recording each command. */
function webviewLabelled(label: string, called: string[]) {
  return {
    __TAURI_INTERNALS__: {
      invoke: async (command: string) => {
        called.push(command);
        return null;
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      metadata: { currentWindow: { label } },
    },
  };
}

let element: HTMLDivElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
});

/** A page's storage whose Recent holds Acme, the folder Studio last had open. */
function recentWithAcme() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
  new RecentWorkspaces(storage).remember({ location: "/work/acme", name: "acme" });
  return storage;
}

/** The page's own window as the shell's window labelled `label`, so a started shortcut hears keys. */
function pageWindowLabelled(label: string, called: string[]) {
  // jsdom has no `matchMedia`, which the shell follows the phone width with.
  return Object.assign(window, webviewLabelled(label, called), {
    matchMedia: (media: string) => ({
      matches: false,
      media,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

/** Acme as the window opened it, whose one Paperclip connection holds its key. */
async function openedAcme(shell: Shell): Promise<OpenedWorkspace> {
  const services = new ServiceRegistry();
  services.provide(AgentConnectionsService, {
    list: async () => [{ id: "board", state: { kind: "online", asOf: "" } } as AgentConnection],
    subscribe: () => () => undefined,
  } as unknown as AgentConnections);
  const workspace = new StudioWorkspace({ toasts: shell.toasts, services, name: "Acme" });
  return { name: "Acme", workspace, dispose: async () => services.dispose() };
}

function pressFeedbackShortcut(): KeyboardEvent {
  const keys = new KeyboardEvent("keydown", {
    code: "KeyF",
    key: "F",
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  });
  window.dispatchEvent(keys);
  return keys;
}

function start(label: string, called: string[]) {
  // Acme is in Recent, so a window that opened the last workspace would ask the shell for it.
  const storage = recentWithAcme();
  started = startStudio({
    element,
    window: webviewLabelled(label, called),
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    storage,
  });
}

verifies("studio.feedback-windows", () => {
  it("shows only the not-available window in the window labelled feedback-unavailable", async () => {
    const called: string[] = [];
    start("feedback-unavailable", called);
    await vi.waitFor(() =>
      expect(element.textContent).toBe(
        "Studio can't take a screenshot for feedback on this system.Not now",
      ),
    );
    expect(called).toEqual([]);
  });
});

verifies("studio.feedback-window", () => {
  it.each(["inbox", "messenger"])(
    "asks the shell for a capture when Ctrl Shift F is pressed in the %s window that opened Acme",
    async (label) => {
      const called: string[] = [];
      const page = pageWindowLabelled(label, called);
      try {
        const shell = createShell({ ...desktopFeatures, host: "desktop-app", platform: "windows" });
        const app = focusedAppOf(page, shell);
        const ipc = tauriIpc(page);
        if (app === undefined || ipc === undefined) throw new Error(`No ${label} window here.`);
        const storage = recentWithAcme();
        started = startFocusedApp(
          {
            element,
            window: page,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            storage,
          },
          {
            shell,
            ipc,
            platform: "windows",
            app,
            language: "en",
            display: displaySettingsOf({ window: page, storage }),
            openWorkspace: () => openedAcme(shell),
          },
        );

        await vi.waitFor(() => {
          const keys = pressFeedbackShortcut();
          expect(keys.defaultPrevented).toBe(true);
        });
        await vi.waitFor(() => expect(called).toContain("plugin:feedback|start"));
      } finally {
        await started?.stop();
        started = undefined;
        Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
      }
    },
  );

  it.each(["inbox", "messenger"])(
    "starts no feedback shortcut in the %s window while it opened no folder",
    async (label) => {
      const called: string[] = [];
      const page = pageWindowLabelled(label, called);
      try {
        started = startStudio({
          element,
          window: page,
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        });
        await vi.waitFor(() => expect(element.textContent).not.toBe(""));
        const keys = pressFeedbackShortcut();

        expect(keys.defaultPrevented).toBe(false);
        expect(called).not.toContain("plugin:feedback|start");
      } finally {
        await started?.stop();
        started = undefined;
        Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
      }
    },
  );
});
