import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ServiceRegistry } from "@halonicjs/app";
import { PluginsHostService } from "@halonicjs/studio-feature-plugins/api";
import type { TauriIpc } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { providePlugins } from "./provide-plugins.ts";

const transport = {} as AgentHostTransport;

/** A shell that reads an empty plugins folder, or fails once told to. */
function acmeShell() {
  const state = { reads: 0, failing: false };
  const ipc: TauriIpc = {
    async invoke(command) {
      if (command === "plugin_folder_entries") {
        state.reads += 1;
        if (state.failing) throw new Error("acme folder unreadable");
      }
      return [];
    },
  };
  return { ipc, state };
}

/** A window whose focus the test brings on, and how many listeners it has. */
function acmeWindow() {
  const listeners: (() => void)[] = [];
  return {
    window: {},
    listeners,
    onFocus: (listener: () => void) => {
      listeners.push(listener);
      return () => {};
    },
    focus: () => {
      for (const listener of listeners) listener();
    },
  };
}

/** Lets the reads the test started finish; they only wait on the fake shell, never on time. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
}

verifies("studio.desktop-plugins-registered", () => {
  describe("providePlugins", () => {
    it("reads the plugins folder on start and again whenever the window comes to the front", async () => {
      const { ipc, state } = acmeShell();
      const page = acmeWindow();
      providePlugins(new ServiceRegistry(), {
        ipc,
        window: page.window,
        transport,
        onFocus: page.onFocus,
        onReloadFailed: () => {},
      });
      await settle();
      const afterStart = state.reads;

      page.focus();
      await settle();

      expect(afterStart).toBeGreaterThan(0);
      expect(state.reads).toBeGreaterThan(afterStart);
    });

    it("gives a second folder of the window the same host, without a second focus listener", () => {
      const { ipc } = acmeShell();
      const page = acmeWindow();
      const parts = {
        ipc,
        window: page.window,
        transport,
        onFocus: page.onFocus,
        onReloadFailed: () => {},
      };
      const first = new ServiceRegistry();
      const second = new ServiceRegistry();

      providePlugins(first, parts);
      providePlugins(second, parts);

      expect(second.get(PluginsHostService)).toBe(first.get(PluginsHostService));
      expect(page.listeners).toHaveLength(1);
    });

    it("tells onReloadFailed when reading the folder again fails", async () => {
      const { ipc, state } = acmeShell();
      const page = acmeWindow();
      const failures: unknown[] = [];
      providePlugins(new ServiceRegistry(), {
        ipc,
        window: page.window,
        transport,
        onFocus: page.onFocus,
        onReloadFailed: (error) => failures.push(error),
      });
      await settle();
      state.failing = true;

      page.focus();
      await settle();

      expect(failures).not.toHaveLength(0);
    });

    it("provides nothing where the page has no agent host", () => {
      const { ipc } = acmeShell();
      const page = acmeWindow();
      const services = new ServiceRegistry();

      providePlugins(services, {
        ipc,
        window: page.window,
        transport: undefined,
        onFocus: page.onFocus,
        onReloadFailed: () => {},
      });

      expect(() => services.get(PluginsHostService)).toThrow();
      expect(page.listeners).toHaveLength(0);
    });
  });
});
