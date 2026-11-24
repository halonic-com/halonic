import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  dynamicImportsOf,
  repoRoot,
  valueGraphOf,
  valueImportsOf,
} from "./test/value-imports.spec.ts";

/** A specifier the engine may not import by value, or load with `import()`. */
function isForbidden(specifier: string): boolean {
  if (specifier === "yaml" || specifier.startsWith("yaml/")) return true;
  if (specifier === "@halonicjs/yaml" || specifier.startsWith("@halonicjs/yaml/")) return true;
  if (specifier === "@halonicjs/app" || specifier === "@halonicjs/format") return true;
  return (
    specifier.startsWith("@halonicjs/workspace") && specifier !== "@halonicjs/workspace/trust-url"
  );
}

/** The engine's own source files, tests and test helpers' folder left out. */
function engineSources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : engineSources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

verifies("engine.yaml-free-graph", () => {
  describe("the walker", () => {
    it("counts imports, re-exports, side-effect imports and inline type imports as value imports", () => {
      const source = [
        'import { a } from "./a.ts";',
        'import b, * as c from "./b.ts";',
        'export { d } from "./d.ts";',
        'export * from "./e.ts";',
        'export * as f from "./f.ts";',
        'import "./g.ts";',
        'import { type H } from "./h.ts";',
        "import {",
        "  i,",
        "  type I,",
        '} from "./i.ts";',
      ].join("\n");
      expect(valueImportsOf(source).sort()).toEqual(
        ["./a.ts", "./b.ts", "./d.ts", "./e.ts", "./f.ts", "./g.ts", "./h.ts", "./i.ts"].sort(),
      );
    });

    it("leaves out import type, export type and imports in comments", () => {
      const source = [
        'import type { A } from "./a.ts";',
        'export type { B } from "./b.ts";',
        '// import { c } from "./c.ts";',
        '/* export * from "./d.ts"; */',
      ].join("\n");
      expect(valueImportsOf(source)).toEqual([]);
    });

    it("finds a dynamic import by its string", () => {
      expect(dynamicImportsOf('const app = await import("@halonicjs/app");')).toEqual([
        "@halonicjs/app",
      ]);
    });
  });

  describe("the engine's entry point", () => {
    const { files, outside } = valueGraphOf(join(import.meta.dirname, "index.ts"));
    const reached = files.map((file) => relative(repoRoot, file));

    it("reaches neither the format root nor the app root", () => {
      expect(reached).not.toContain("packages/core/format/src/index.ts");
      expect(reached).not.toContain("packages/core/app/src/index.ts");
    });

    it("reaches no workspace file but trust-url.ts", () => {
      const workspaceFiles = reached.filter(
        (file) =>
          file.startsWith("packages/core/workspace/") &&
          file !== "packages/core/workspace/src/trust-url.ts",
      );
      expect(workspaceFiles).toEqual([]);
    });

    it("reaches no yaml", () => {
      expect(reached.filter((file) => file.startsWith("packages/core/yaml/"))).toEqual([]);
      expect(outside.filter(isForbidden)).toEqual([]);
    });

    it("loads no forbidden package with a dynamic import", () => {
      const refused = engineSources(import.meta.dirname).flatMap((file) =>
        dynamicImportsOf(readFileSync(file, "utf8"))
          .filter(isForbidden)
          .map((specifier) => `${relative(repoRoot, file)}: ${specifier}`),
      );
      expect(refused).toEqual([]);
    });
  });
});
