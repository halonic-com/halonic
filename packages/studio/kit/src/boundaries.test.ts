import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The shell and every feature depend on the kit, never the other way round. If the kit imported
 * a Studio package, the two would grow into each other, so this test fails on the first one.
 */
describe("studio-kit boundaries", () => {
  it("depends on no other Studio package", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as Record<"dependencies" | "devDependencies" | "peerDependencies", object | undefined>;
    const dependencyNames = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    });
    expect(dependencyNames.filter((name) => name.startsWith("@halonicjs/studio-"))).toEqual([]);
  });

  it("imports nothing from another Studio package", () => {
    // `from "…"`, `import("…")` and CSS `@import "…"`, for any Studio package but the kit itself.
    const studioImport = /(?:from|import\(|@import)\s*["']@halonicjs\/studio-(?!kit["'/])/;
    const sourceFolder = new URL("./", import.meta.url);
    const files = readdirSync(sourceFolder, { recursive: true, encoding: "utf8" }).filter((file) =>
      /\.(?:ts|tsx|css)$/.test(file),
    );
    const offenders = files.filter((file) =>
      studioImport.test(readFileSync(new URL(file, sourceFolder), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
