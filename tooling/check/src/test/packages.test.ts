import { describe, expect, it } from "vitest";
import {
  coreOrder,
  type FixturePackage,
  feature,
  format,
  manifestFor,
  rulesHit,
  runChecks,
  std,
  studioApp,
} from "./fixture-repo.ts";

describe("tooling/check: packages", () => {
  it("passes an empty package and an empty feature", () => {
    expect(
      runChecks([std, format, feature("agents"), studioApp(["agents"])], { coreOrder }),
    ).toEqual([]);
  });

  it("requires workspace:* for internal dependencies", () => {
    const ranged = {
      ...format,
      manifest: manifestFor("@halonicjs/format", "core", {
        dependencies: { "@halonicjs/std": "^0.1.0" },
      }),
    };
    expect(rulesHit([std, ranged], { coreOrder })).toEqual(["packages"]);
  });

  it("flags wrong names, public packages and a missing owner", () => {
    const wrong: FixturePackage = {
      directory: "packages/core/std",
      manifest: {
        name: "@halonicjs/stdlib",
        type: "module",
        exports: { ".": "./src/index.ts" },
        halonic: { layer: "core" },
      },
    };
    const messages = runChecks([wrong], { coreOrder: ["@halonicjs/stdlib"] }).map(
      (problem) => problem.message,
    );
    expect(messages.some((message) => message.includes('must be "@halonicjs/std"'))).toBe(true);
    expect(messages.some((message) => message.includes('"private": true'))).toBe(true);
    expect(messages.some((message) => message.includes("owner"))).toBe(true);
  });
});
