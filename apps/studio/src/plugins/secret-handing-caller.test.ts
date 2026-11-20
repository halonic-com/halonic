import type { Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { secretHandingCaller } from "./secret-handing-caller.ts";

// A fake value only these tests use.
const fakeValue = "fake-acme-key-for-tests-only";

/** A caller over a keychain holding `stored`, for a plugin `acme-weather` that declares `declared`, which keeps what happened in order. */
function callerOver(options: {
  stored: Record<string, string>;
  declared: readonly string[];
  refuse?: Error;
}) {
  const happened: unknown[] = [];
  const keychain: Secrets = { get: async (name) => options.stored[name] ?? null };
  const caller = secretHandingCaller({
    caller: {
      call: async (plugin, tool, args) => {
        happened.push({ call: { plugin, tool, args } });
        return "done";
      },
    },
    handOver: {
      handOver: async (plugin, secrets) => {
        if (options.refuse !== undefined) throw options.refuse;
        happened.push({ handOver: { plugin, secrets } });
        return Object.keys(secrets).length;
      },
    },
    keychain,
    secretNames: (plugin) =>
      plugin === "acme-weather"
        ? Object.fromEntries(
            options.declared.map((secret) => [secret, `plugin__${plugin}__${secret}`]),
          )
        : {},
  });
  return { caller, happened };
}

verifies("studio.plugin-secret-hand-over", () => {
  describe("the secret-handing caller", () => {
    it("hands over the plugin's stored secrets by their declared names, then calls", async () => {
      const { caller, happened } = callerOver({
        stored: { "plugin__acme-weather__acme-key": fakeValue, "acme-key": "not-this-one" },
        declared: ["acme-key"],
      });
      expect(await caller.call("acme-weather", "forecast", { city: "Oslo" })).toBe("done");
      expect(happened).toEqual([
        { handOver: { plugin: "acme-weather", secrets: { "acme-key": fakeValue } } },
        { call: { plugin: "acme-weather", tool: "forecast", args: { city: "Oslo" } } },
      ]);
    });

    it("leaves out a secret the keychain doesn't hold, so the host forgets it", async () => {
      const { caller, happened } = callerOver({ stored: {}, declared: ["acme-key"] });
      await caller.call("acme-weather", "forecast", {});
      expect(happened[0]).toEqual({ handOver: { plugin: "acme-weather", secrets: {} } });
    });

    it("hands nothing over for a plugin that declares no secret", async () => {
      const { caller, happened } = callerOver({ stored: {}, declared: [] });
      await caller.call("acme-weather", "forecast", {});
      await caller.call("other", "tool", {});
      expect(happened).toEqual([
        { call: { plugin: "acme-weather", tool: "forecast", args: {} } },
        { call: { plugin: "other", tool: "tool", args: {} } },
      ]);
    });

    it("makes no call when the hand-over fails", async () => {
      const refusal = new Error("The plugin isn't trusted.");
      const { caller, happened } = callerOver({
        stored: { "plugin__acme-weather__acme-key": fakeValue },
        declared: ["acme-key"],
        refuse: refusal,
      });
      await expect(caller.call("acme-weather", "forecast", {})).rejects.toBe(refusal);
      expect(happened).toEqual([]);
    });
  });
});
