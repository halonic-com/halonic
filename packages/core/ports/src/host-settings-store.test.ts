import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type HostSettingsStore,
  type HostSettingValue,
  type HostSettingValues,
  hostSettingsMaxBytes,
  isHostSettingKey,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.host-settings-store", () => {
  typeTest("only stores values by key: read, set and watch", () => {
    expectTypeOf<keyof HostSettingsStore>().toEqualTypeOf<"read" | "set" | "watch">();
    expectTypeOf<HostSettingsStore["read"]>().parameters.toEqualTypeOf<[]>();
    expectTypeOf<HostSettingsStore["read"]>().returns.toEqualTypeOf<Promise<HostSettingValues>>();
    expectTypeOf<HostSettingsStore["set"]>().parameters.toEqualTypeOf<
      [key: string, value: HostSettingValue | undefined]
    >();
    expectTypeOf<HostSettingsStore["watch"]>().parameters.toEqualTypeOf<[listener: () => void]>();
    expectTypeOf<HostSettingsStore["watch"]>().returns.toEqualTypeOf<() => void>();
  });

  it("holds only what JSON can hold", () => {
    const model: HostSettingValue = { provider: "anthropic", stop: ["END"], local: false };
    // @ts-expect-error: a value is saved as JSON, which has no undefined inside it
    const unset: HostSettingValue = { provider: undefined };
    // @ts-expect-error: nor dates
    const dated: HostSettingValue = new Date(0);
    expect([model, unset, dated]).toHaveLength(3);
  });

  it("allows a key of two or more lowercase words joined by dots, up to 64 characters", () => {
    expect(isHostSettingKey("assistant.turn-limit")).toBe(true);
    expect(isHostSettingKey("sandbox.new-agents")).toBe(true);
    expect(isHostSettingKey("assistant.model.v2")).toBe(true);
    expect(isHostSettingKey(`a.${"b".repeat(62)}`)).toBe(true);
    for (const key of [
      "turn-limit",
      "Assistant.model",
      "assistant.turn_limit",
      "assistant..model",
      "assistant.-model",
      "assistant.model-",
      "__proto__.model",
      "assistant/model.x",
      `a.${"b".repeat(63)}`,
    ]) {
      expect(isHostSettingKey(key), key).toBe(false);
    }
  });

  it("lets the saved settings take 256 KiB", () => {
    expect(hostSettingsMaxBytes).toBe(262_144);
  });
});
