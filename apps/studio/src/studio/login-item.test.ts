import { ServiceRegistry } from "@halonicjs/app";
import { LoginItemService } from "@halonicjs/studio-feature-settings/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { loginItemOf, provideLoginItem } from "./login-item.ts";

verifies("settings.startup-section", () => {
  describe("loginItemOf", () => {
    it("reads and sets the login item through the shell's two commands", async () => {
      const invoke = vi.fn(async (command: string) => command === "login_item_set");
      const host = loginItemOf({ invoke }, "windows");

      expect(await host?.get()).toEqual({ on: false });
      expect(await host?.set(true)).toEqual({ on: true });
      expect(invoke.mock.calls).toEqual([["login_item_get"], ["login_item_set", { on: true }]]);
    });

    it("answers the shell's refusals as refusals", async () => {
      const host = loginItemOf({ invoke: async () => Promise.reject("not_installed") }, "windows");
      const failed = loginItemOf({ invoke: async () => Promise.reject("failed") }, "macos");

      expect(await host?.set(true)).toEqual({ refused: "not_installed" });
      expect(await failed?.get()).toEqual({ refused: "failed" });
    });

    it("throws anything else, so it is never read as a setting", async () => {
      const refused = loginItemOf({ invoke: async () => Promise.reject("not allowed") }, "windows");
      const odd = loginItemOf({ invoke: async () => "on" }, "macos");

      await expect(refused?.get()).rejects.toBe("not allowed");
      await expect(odd?.get()).rejects.toThrow('expected on or off, got "on"');
    });

    it("puts the icon in the menu bar on macOS and in the tray elsewhere", () => {
      const invoke = async () => false;

      expect(loginItemOf({ invoke }, "macos")?.iconIn).toBe("menu-bar");
      expect(loginItemOf({ invoke }, "windows")?.iconIn).toBe("tray");
    });

    it("gives no login item on Linux, where a start at login can't stay in the tray", () => {
      const invoke = vi.fn(async () => false);

      expect(loginItemOf({ invoke }, "linux")).toBeUndefined();
      expect(invoke).not.toHaveBeenCalled();
    });

    it("gives Settings the login item on Windows and macOS only", () => {
      const invoke = async () => false;
      const onWindows = new ServiceRegistry();
      const onLinux = new ServiceRegistry();

      provideLoginItem(onWindows, { invoke }, "windows");
      provideLoginItem(onLinux, { invoke }, "linux");

      expect(onWindows.has(LoginItemService)).toBe(true);
      expect(onLinux.has(LoginItemService)).toBe(false);
    });
  });
});
