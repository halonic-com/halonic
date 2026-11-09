import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { ConnectionKey, ConnectionSettingsRecord, ConnectionSettingsStore } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const settings: ConnectionSettingsRecord = {
  location: "/workspaces/acme",
  connector: "mail",
  allowSending: true,
  changedAt: "2026-11-09T10:00:00.000Z",
};

verifies("ports.connection-settings-store", () => {
  typeTest("only stores settings: get, save and remove", () => {
    expectTypeOf<keyof ConnectionSettingsStore>().toEqualTypeOf<"get" | "save" | "remove">();
    expectTypeOf<ConnectionSettingsStore["get"]>().parameters.toEqualTypeOf<[key: ConnectionKey]>();
    expectTypeOf<ConnectionSettingsStore["get"]>().returns.toEqualTypeOf<
      Promise<ConnectionSettingsRecord | null>
    >();
    expectTypeOf<ConnectionSettingsStore["save"]>().parameters.toEqualTypeOf<
      [settings: ConnectionSettingsRecord]
    >();
    expectTypeOf<ConnectionSettingsStore["remove"]>().parameters.toEqualTypeOf<
      [key: ConnectionKey]
    >();
  });

  it("keeps the key and the sending choice with the settings", () => {
    // @ts-expect-error: sending has to be chosen, it has no default in the store
    const unchosen: ConnectionSettingsRecord = { ...settings, allowSending: undefined };
    // @ts-expect-error: settings belong to one connector
    const unkeyed: ConnectionSettingsRecord = { ...settings, connector: undefined };
    expect(settings.allowSending).toBe(true);
    expect([unchosen, unkeyed]).toHaveLength(2);
  });
});
