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

  it("doesn't count a barrel that only re-exports", () => {
    const reExports = Array.from({ length: 170 }, (_, n) =>
      [
        `// Group ${n}.`,
        `export { a${n}, b${n} } from "./a${n}.ts";`,
        `export type { T${n} } from "./t${n}.ts";`,
        `export * from "./all${n}.ts";`,
      ].join("\n"),
    );
    const barrel = { ...std, files: { "src/index.ts": `${reExports.join("\n")}\n` } };
    expect(rulesHit([barrel], { coreOrder: ["@halonicjs/std"] })).toEqual([]);
  });

  it("counts a barrel that holds any code of its own", () => {
    const reExports = Array.from({ length: 501 }, (_, n) => `export * from "./all${n}.ts";`);
    const ownCode = [
      "export const x = 1;",
      'import { y } from "./y.ts";\nexport { y };',
      'export * from (() => {\n  const z = "./z.ts";\n  return z;\n})();',
      'export { a } from require("./a.cjs");',
    ];
    for (const code of ownCode) {
      const mixed = {
        ...std,
        files: { "src/index.ts": `${reExports.join("\n")}\n${code}\n` },
      };
      expect(rulesHit([mixed], { coreOrder: ["@halonicjs/std"] })).toEqual(["file-size"]);
    }
  });
});
