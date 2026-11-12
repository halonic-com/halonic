import { readFileSync } from "node:fs";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  changeSavedHostSettings,
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  hostSettingsMaxBytes,
  isHostSettingKey,
  readSavedHostSettings,
} from "./index.ts";

/**
 * The golden cases, which the contract suite owns and the desktop shell's
 * Rust side checks too. Read from disk: the port's own code never loads them,
 * so bundles of the port don't carry them.
 */
const golden: {
  keys: { key: string; allowed: boolean }[];
  sizes: { name: string; key: string; character: string; count: number; fits: boolean }[];
  saved: { name: string; text: string; values: HostSettingValues | null; afterSave: unknown }[];
} = JSON.parse(
  readFileSync(
    new URL("../../../testing/contracts/src/golden/host-settings-limits.json", import.meta.url),
    "utf8",
  ),
);

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.host-settings-store", () => {
  typeTest("only stores values by key: read, set, remove and watch", () => {
    expectTypeOf<keyof HostSettingsStore>().toEqualTypeOf<"read" | "set" | "remove" | "watch">();
    expectTypeOf<HostSettingsStore["read"]>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<HostSettingsStore["read"]>().returns.toEqualTypeOf<Promise<HostSettingValues>>();
    expectTypeOf<HostSettingsStore["set"]>().parameters.toEqualTypeOf<
      [key: string, value: HostSettingValue]
    >();
    expectTypeOf<HostSettingsStore["remove"]>().parameters.toEqualTypeOf<[key: string]>();
    expectTypeOf<HostSettingsStore["watch"]>().parameters.toEqualTypeOf<[listener: () => void]>();
    expectTypeOf<HostSettingsStore["watch"]>().returns.toEqualTypeOf<() => void>();
  });

  it("holds only what JSON can hold, null included", () => {
    const model: HostSettingValue = { provider: "anthropic", stop: ["END"], local: false };
    const cleared: HostSettingValue = null;
    // @ts-expect-error: a value is saved as JSON, which has no undefined
    const unset: HostSettingValue = undefined;
    // @ts-expect-error: nor inside an object
    const unsetInside: HostSettingValue = { provider: undefined };
    // @ts-expect-error: nor dates
    const dated: HostSettingValue = new Date(0);
    expect([model, cleared, unset, unsetInside, dated]).toHaveLength(5);
  });

  it("lets the saved settings take 256 KiB", () => {
    expect(hostSettingsMaxBytes).toBe(262_144);
  });

  describe("the golden keys", () => {
    for (const { key, allowed } of golden.keys) {
      it(`${allowed ? "allows" : "refuses"} ${JSON.stringify(key)}`, () => {
        expect(isHostSettingKey(key)).toBe(allowed);
      });
    }
  });

  describe("the golden sizes", () => {
    for (const { name, key, character, count, fits } of golden.sizes) {
      it(name, () => {
        const save = () => changeSavedHostSettings(undefined, key, character.repeat(count));
        if (fits) expect(save).not.toThrow();
        else expect(save).toThrow(RangeError);
      });
    }
  });

  describe("the golden saved settings", () => {
    for (const { name, text, values, afterSave } of golden.saved) {
      it(name, () => {
        expect(readSavedHostSettings(text)).toEqual(values ?? undefined);
        const change = changeSavedHostSettings(text, "assistant.turn-limit", 24);
        expect(JSON.parse(change.text)).toEqual(afterSave);
        expect(change.broken).toBe(values === null);
      });
    }
  });

  it("starts the settings when none are saved, and removes a key", () => {
    const first = changeSavedHostSettings(undefined, "assistant.turn-limit", 20);
    expect(first).toEqual({
      text: '{\n  "version": 1,\n  "values": {\n    "assistant.turn-limit": 20\n  }\n}\n',
      broken: false,
    });
    const removed = changeSavedHostSettings(first.text, "assistant.turn-limit", undefined);
    expect(JSON.parse(removed.text)).toEqual({ version: 1, values: {} });
  });

  it("never refuses a removal for size, but still a save over the limit", () => {
    const over = changeSavedHostSettings(undefined, "assistant.turn-limit", 20).text.replace(
      '"values": {',
      `"values": {\n    "assistant.instructions": "${"x".repeat(hostSettingsMaxBytes)}",`,
    );
    expect(() => changeSavedHostSettings(over, "assistant.turn-limit", 24)).toThrow(RangeError);
    const removed = changeSavedHostSettings(over, "assistant.turn-limit", undefined);
    expect(JSON.parse(removed.text).values).toEqual({
      "assistant.instructions": "x".repeat(hostSettingsMaxBytes),
    });
    const under = changeSavedHostSettings(removed.text, "assistant.instructions", undefined);
    expect(JSON.parse(under.text)).toEqual({ version: 1, values: {} });
  });

  it("refuses a key or a number JSON can't hold before it changes anything", () => {
    expect(() => changeSavedHostSettings(undefined, "turn-limit", 1)).toThrow(RangeError);
    expect(() => changeSavedHostSettings(undefined, "turn-limit", undefined)).toThrow(RangeError);
    for (const value of [Number.NaN, [Number.POSITIVE_INFINITY], { min: -Infinity }]) {
      expect(() => changeSavedHostSettings(undefined, "assistant.turn-limit", value)).toThrow(
        RangeError,
      );
    }
  });
});
