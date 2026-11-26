// @vitest-environment jsdom

import type { ServedWindowProps, WorkspaceWindowProps } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** The props Studio's desktop window and the served window were last drawn with. */
const drawn = vi.hoisted(
  (): {
    desktop?: WorkspaceWindowProps | undefined;
    served?: ServedWindowProps | undefined;
  } => ({}),
);

// The windows themselves, recording what they're drawn with: the Formats choice reaches the
// window's times only through these props (`kit.time-stamp`).
vi.mock("@halonicjs/studio-feature-workspace", async (importOriginal) => {
  const workspace = await importOriginal<typeof import("@halonicjs/studio-feature-workspace")>();
  return {
    ...workspace,
    mountWorkspaceWindow: (
      element: Element,
      props: WorkspaceWindowProps,
      openExternal?: Parameters<typeof workspace.mountWorkspaceWindow>[2],
    ) => {
      drawn.desktop = props;
      const mounted = workspace.mountWorkspaceWindow(element, props, openExternal);
      return {
        unmount: () => mounted.unmount(),
        update: (next: WorkspaceWindowProps) => {
          drawn.desktop = next;
          mounted.update(next);
        },
      };
    },
    mountServedWindow: (element: Element, props: ServedWindowProps) => {
      drawn.served = props;
      return workspace.mountServedWindow(element, props);
    },
  };
});

/** A desktop window: jsdom has no `matchMedia`, and the shell follows the phone width with it. */
function desktopMediaQueries(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

/** Storage where Settings → Formats is set to German (Germany). */
function storageWithFormat() {
  const map = new Map<string, string>([["halonic.settings.formats.format", '"de-DE"']]);
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/** The desktop app's webview in Studio's own window, with no workspace in Recent. */
function studioWebview() {
  const invoke = async (command: string) => {
    if (command === "system_region") return "en_US.UTF-8";
    if (command === "resource_report") {
      return { engineMemoryBytes: 0, childProcesses: [], dataBytes: 0, freeDiskBytes: 0 };
    }
    if (command === "fs_list" || command === "run_logs") return [];
    if (command === "host_settings_read") return {};
    return null;
  };
  return {
    __TAURI_INTERNALS__: {
      invoke,
      transformCallback: () => 1,
      unregisterCallback: () => {},
      metadata: { currentWindow: { label: "main" } },
    },
  };
}

let element: HTMLDivElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  window.matchMedia = desktopMediaQueries;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
  drawn.desktop = undefined;
  drawn.served = undefined;
  vi.restoreAllMocks();
});

verifies("kit.time-stamp", () => {
  it("gives Studio's desktop window the format chosen in Settings → Formats", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    started = startStudio({
      element,
      window: studioWebview(),
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      storage: storageWithFormat(),
    });

    await vi.waitFor(() => expect(drawn.desktop?.chosenFormat?.get()).toBe("de-DE"), {
      timeout: 15_000,
    });
  }, 30_000);

  it("gives the served window the format chosen in Settings → Formats", async () => {
    started = startStudio({
      element,
      window,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      storage: storageWithFormat(),
      fetch: async (path) =>
        path === "/api/workspace"
          ? Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" })
          : Response.json({ runs: [] }),
    });

    await vi.waitFor(() => expect(drawn.served?.chosenFormat?.get()).toBe("de-DE"), {
      timeout: 15_000,
    });
  }, 30_000);
});
