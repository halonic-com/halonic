import { ServiceRegistry } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { hostSettingsStoreKey, provideShellHostSettings } from "./shell-host-settings.ts";

/** A page in the shell whose host settings commands keep the values in memory. */
function shellPage(): { page: object; calls: string[] } {
  const values: Record<string, unknown> = {};
  const calls: string[] = [];
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push(command);
    if (command === "host_settings_set") {
      values[String(args?.["key"])] = args?.["value"];
      return null;
    }
    return { ...values };
  };
  return { page: { __TAURI_INTERNALS__: { invoke } }, calls };
}

verifies("services.shell-host-settings", () => {
  describe("provideShellHostSettings", () => {
    it("gives the shell's host settings in the shell", async () => {
      const { page, calls } = shellPage();
      const services = new ServiceRegistry();
      expect(provideShellHostSettings(services, page)).toBe(true);

      const store = services.get(hostSettingsStoreKey);
      await store.set("assistant.turn-limit", 20);
      expect(await store.read()).toEqual({ "assistant.turn-limit": 20 });
      expect(calls).toEqual(["host_settings_set", "host_settings_read"]);
    });

    it("provides nothing outside the shell, and says so", () => {
      const services = new ServiceRegistry();
      expect(provideShellHostSettings(services, {})).toBe(false);
      expect(services.has(hostSettingsStoreKey)).toBe(false);
    });
  });
});
