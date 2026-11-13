import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  isSandboxSetting,
  type SandboxBackendId,
  type SandboxSetting,
  type SandboxSettingStore,
  sandboxBackendIds,
} from "./index.ts";

const chosenAt = "2026-11-13T09:00:00.000Z";
const setting: SandboxSetting = { backend: "srt-wsl", chosenAt };
const without: SandboxSetting = { backend: "none", chosenAt, appVersion: "0.1.0" };

verifies("ports.sandbox-setting-store", () => {
  typeTest("only stores the choice: get, save and remove", () => {
    expectTypeOf<keyof SandboxSettingStore>().toEqualTypeOf<"get" | "save" | "remove">();
    expectTypeOf<SandboxSettingStore["get"]>().returns.toEqualTypeOf<
      Promise<SandboxSetting | null>
    >();
    expectTypeOf<SandboxSettingStore["save"]>().parameters.toEqualTypeOf<
      [setting: SandboxSetting]
    >();
  });

  typeTest("names the backends in one closed list", () => {
    expectTypeOf<SandboxBackendId>().toEqualTypeOf<
      "srt" | "srt-wsl" | "mxc" | "docker-sbx" | "cloud"
    >();
  });

  it("needs the app version for a choice of no sandbox", () => {
    // @ts-expect-error: a choice to go without a sandbox says which version it was made in
    const unversioned: SandboxSetting = { backend: "none", chosenAt };
    // @ts-expect-error: a backend must be one the list names
    const unknown: SandboxSetting = { backend: "docker", chosenAt };
    expect([unversioned, unknown]).toHaveLength(2);
  });
});

verifies("ports.sandbox-setting-store", () => {
  it.each(sandboxBackendIds)("accepts a choice of %s", (backend) => {
    expect(isSandboxSetting({ backend, chosenAt })).toBe(true);
  });

  it("accepts a choice of no sandbox", () => {
    expect(isSandboxSetting({ ...without })).toBe(true);
  });

  it.each([
    ["nothing", null],
    ["text", "srt"],
    ["an array", []],
    ["a backend that isn't listed", { ...setting, backend: "docker" }],
    ["a backend that isn't text", { ...setting, backend: 1 }],
    ["no time", { backend: "srt" }],
    ["a time that isn't text", { ...setting, chosenAt: 0 }],
    ["an extra field", { ...setting, sandbox: false }],
    ["an app version on a backend", { ...setting, appVersion: "0.1.0" }],
    ["no app version on a choice of none", { backend: "none", chosenAt }],
    ["an app version that isn't text", { ...without, appVersion: 1 }],
    ["a name from the prototype", { backend: "toString", chosenAt }],
  ])("refuses %s", (_kind, value) => {
    expect(isSandboxSetting(value)).toBe(false);
  });

  it("refuses a field it only inherits, even with the right number of fields", () => {
    const inherited = Object.assign(Object.create({ chosenAt }), { backend: "srt", extra: "x" });
    expect(isSandboxSetting(inherited)).toBe(false);
  });
});
