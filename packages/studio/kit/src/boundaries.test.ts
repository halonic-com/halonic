import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The shell and every feature depend on the kit, never the other way round. If the kit imported
 * a Studio package, the two would grow into each other, so this test fails on the first one.
 */

/**
 * An import of any Studio package but the kit itself, in every form TypeScript and CSS allow:
 * `from "…"`, `import "…"`, `import("…")`, `@import "…"`, `@import url("…")` and Tailwind's
 * `@reference "…"`.
 */
const studioImport =
  /(?:\bfrom|\bimport\s*\(?|@import|@reference)\s*(?:url\()?\s*["']@halonicjs\/studio-(?!kit["'/])/;

/** The states page's attribute for a forced hover, press or focus (states/states.css). */
const forceStateAttribute = "data-force-state";

/** This file, which holds sample imports for the cases below and would otherwise flag itself. */
const thisFile = "boundaries.test.ts";

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

  it.each([
    'import { Shell } from "@halonicjs/studio-shell";',
    'export * from "@halonicjs/studio-shell";',
    'import "@halonicjs/studio-shell";',
    'const shell = await import("@halonicjs/studio-shell");',
    '@import "@halonicjs/studio-shell";',
    '@import url("@halonicjs/studio-shell/theme.css");',
    '@reference "@halonicjs/studio-shell";',
  ])("recognises %s as a Studio import", (line) => {
    expect(studioImport.test(line)).toBe(true);
  });

  it.each([
    '@import "@halonicjs/studio-kit";',
    'import { contrastRatio } from "./test/contrast.ts";',
    'import { describe } from "vitest";',
  ])("lets %s through", (line) => {
    expect(studioImport.test(line)).toBe(false);
  });

  it("imports nothing from another Studio package", () => {
    const sourceFolder = new URL("./", import.meta.url);
    const files = readdirSync(sourceFolder, { recursive: true, encoding: "utf8" }).filter(
      (file) => /\.(?:ts|tsx|css)$/.test(file) && file !== thisFile,
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) =>
      studioImport.test(readFileSync(new URL(file, sourceFolder), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("leaves forcing a state to the states page, so it never reaches the app", () => {
    const sourceFolder = new URL("./", import.meta.url);
    const files = readdirSync(sourceFolder, { recursive: true, encoding: "utf8" }).filter(
      (file) => /\.(?:ts|tsx|css)$/.test(file) && file !== thisFile,
    );
    const offenders = files.filter((file) =>
      readFileSync(new URL(file, sourceFolder), "utf8").includes(forceStateAttribute),
    );
    expect(offenders).toEqual([]);
  });
});
