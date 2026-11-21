import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadContext } from "../lib/context.ts";
import { checkFileSize } from "../rules/file-size.ts";
import {
  feature,
  removeFixtureRepo,
  rulesHit,
  std,
  studioApp,
  writeFixtureRepo,
} from "./fixture-repo.ts";

const linesOf = (count: number): string => "export const x = 1;\n".repeat(count);

/** The file-size errors for a file committed at `before` lines and changed to `after`. */
function headroomErrors(before: number, after: number, base: string | undefined): string[] {
  const root = writeFixtureRepo([{ ...std, files: { "src/index.ts": linesOf(before) } }], {
    coreOrder: ["@halonicjs/std"],
  });
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "base");
    writeFileSync(join(root, "packages/core/std/src/index.ts"), linesOf(after));
    return checkFileSize(loadContext(root), base)
      .problems.filter((problem) => problem.severity === "error")
      .map((problem) => problem.message);
  } finally {
    removeFixtureRepo(root);
  }
}

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

  it("fails a pull request that grows a file to within 20 lines of the limit", () => {
    expect(headroomErrors(479, 499, "HEAD")).toEqual([
      "499 lines; a pull request may grow a file to at most 480, 20 under the limit of 500, so two pull requests together can't push it over in the merge queue. Split it by concept in this pull request.",
    ]);
  });

  it("passes a file the pull request grows only up to 480 lines, or doesn't grow", () => {
    expect(headroomErrors(470, 480, "HEAD")).toEqual([]);
    expect(headroomErrors(495, 495, "HEAD")).toEqual([]);
    expect(headroomErrors(495, 490, "HEAD")).toEqual([]);
  });

  it("keeps the plain limit without a base commit, as in the merge queue", () => {
    expect(headroomErrors(479, 499, undefined)).toEqual([]);
    expect(headroomErrors(479, 501, undefined)).toHaveLength(1);
  });
});
