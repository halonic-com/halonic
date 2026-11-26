import { ServiceRegistry } from "@halonicjs/app";
import { AskKeysSettingsService } from "@halonicjs/studio-feature-quick-ask/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  askKeysOf,
  askKeysSettingsOf,
  provideAskKeysSettings,
} from "./provide-ask-keys-settings.ts";

/** A shell that reads `read` for `shortcut`, and refuses `shortcut_set` with `refusal`, if any. */
function shell(read: unknown = { shortcut: "control+alt+Space", state: "on" }, refusal?: unknown) {
  return {
    invoke: vi.fn(async (command: string, _args?: Record<string, unknown>) => {
      if (command === "plugin:quick-ask|shortcut") return read;
      if (refusal !== undefined) throw refusal;
      return null;
    }),
  };
}

describe("provideAskKeysSettings", () => {
  verifies("studio.quick-ask-settings", () => {
    it("gives the main window the shell's keys and shortcut_set, with its platform", async () => {
      const services = new ServiceRegistry();
      const ipc = shell({ shortcut: "control+alt+Space", state: "taken" });
      provideAskKeysSettings(services, ipc, "main", "macos");

      const settings = services.get(AskKeysSettingsService);
      expect(settings.platform).toBe("macos");
      expect(await settings.keys()).toEqual({ shortcut: "control+alt+Space", state: "taken" });
      expect(await settings.setKeys("Control+Alt+KeyK")).toBe("saved");
      expect(ipc.invoke).toHaveBeenCalledWith("plugin:quick-ask|shortcut_set", {
        shortcut: "Control+Alt+KeyK",
      });
    });

    it("answers with the refusal the shell names, and throws any other", async () => {
      const refusedWith = (refusal: unknown) =>
        askKeysSettingsOf(shell(undefined, refusal), "linux").setKeys("x");
      await expect(refusedWith("taken")).resolves.toBe("taken");
      await expect(refusedWith("wayland")).resolves.toBe("wayland");
      await expect(refusedWith(new Error("gone"))).rejects.toThrow(
        "plugin:quick-ask|shortcut_set refused: Error: gone",
      );
    });

    it("throws when the shell reads keys it shouldn't", () => {
      expect(askKeysOf({ shortcut: "alt+Space", state: "wayland" })).toEqual({
        shortcut: "alt+Space",
        state: "wayland",
      });
      expect(() => askKeysOf({ shortcut: "alt+Space", state: "off" })).toThrow(
        'plugin:quick-ask|shortcut answered {"shortcut":"alt+Space","state":"off"}',
      );
      expect(() => askKeysOf(null)).toThrow("plugin:quick-ask|shortcut answered null");
    });

    it("gives none to another window or the served Studio", () => {
      const services = new ServiceRegistry();
      provideAskKeysSettings(services, shell(), "ask", "linux");
      provideAskKeysSettings(services, undefined, "main", "linux");
      expect(services.has(AskKeysSettingsService)).toBe(false);
    });
  });
});
