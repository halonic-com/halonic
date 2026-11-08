import { describe, expect, it } from "vitest";
import { feature, rulesHit, std, studioApp } from "./fixture-repo.ts";

describe("tooling/check: features and size", () => {
  it("fails when the Studio's feature list doesn't match the folders", () => {
    expect(rulesHit([feature("agents"), studioApp([])])).toEqual(["features"]);
    expect(rulesHit([feature("agents"), studioApp(["agents", "inbox"])])).toEqual([
      "features",
      "packages",
    ]);
  });

  it("fails files over 500 lines", () => {
    const big = { ...std, files: { "src/index.ts": "export const x = 1;\n".repeat(501) } };
    expect(rulesHit([big], { coreOrder: ["@halonicjs/std"] })).toEqual(["file-size"]);
  });
});
