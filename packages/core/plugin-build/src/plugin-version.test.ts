import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isPluginVersion, nextPluginVersion } from "./plugin-version.ts";

verifies("plugin-build.version", () => {
  it("takes the version asked for over the previous one", () => {
    expect(nextPluginVersion({ requested: "2.0.0", previous: "0.3.4" })).toEqual({
      ok: true,
      value: "2.0.0",
    });
  });

  it("raises the previous version's minor number and resets its patch number", () => {
    expect(nextPluginVersion({ previous: "0.3.4" })).toEqual({ ok: true, value: "0.4.0" });
    expect(nextPluginVersion({ previous: "1.9.0" })).toEqual({ ok: true, value: "1.10.0" });
  });

  it("starts at 0.1.0", () => {
    expect(nextPluginVersion({})).toEqual({ ok: true, value: "0.1.0" });
  });

  it.each([
    "v1.0.0",
    "1.0",
    "1.0.0-beta.1",
    "1.0.0+build",
    "01.0.0",
    "1.0.0 ",
    "1.0.0/../x",
    "1000000000.0.0",
    "",
  ])("refuses %j", (version) => {
    expect(isPluginVersion(version)).toBe(false);
    expect(nextPluginVersion({ requested: version })).toEqual({
      ok: false,
      error: { code: "bad-version", version },
    });
  });

  it("refuses a previous version that isn't strict, and a minor number that outgrows 9 digits", () => {
    expect(nextPluginVersion({ previous: "v0.3.0" })).toEqual({
      ok: false,
      error: { code: "bad-version", version: "v0.3.0" },
    });
    expect(nextPluginVersion({ previous: "0.999999999.0" })).toEqual({
      ok: false,
      error: { code: "bad-version", version: "0.1000000000.0" },
    });
  });
});
