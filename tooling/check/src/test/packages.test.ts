import { describe, expect, it } from "vitest";
import type { Layer } from "../lib/layout.ts";
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

  it("lets core packages, and no others, export ./host", () => {
    const withHost = (directory: string, name: string, layer: Layer): FixturePackage => ({
      directory,
      manifest: manifestFor(name, layer, {
        exports: { ".": "./src/index.ts", "./host": "./src/host.ts" },
      }),
      files: { "src/index.ts": "export const x = 1;\n", "src/host.ts": "export const y = 1;\n" },
    });
    const core = withHost("packages/core/secrets", "@halonicjs/secrets", "core");
    const adapter = withHost("packages/adapters/git", "@halonicjs/adapter-git", "adapters");
    expect(rulesHit([core], { coreOrder: ["@halonicjs/secrets"] })).toEqual([]);
    expect(rulesHit([adapter])).toEqual(["packages"]);
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
