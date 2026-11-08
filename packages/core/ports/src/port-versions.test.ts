import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { portVersions } from "./port-versions.ts";

const sourceFolder = fileURLToPath(new URL(".", import.meta.url));
const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");

/** Source files that hold shared types or the package's lists, not a port. */
const notPorts = new Set(["chat.ts", "index.ts", "port-versions.ts"]);

const portFiles = readdirSync(sourceFolder)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !notPorts.has(file))
  .sort();

/** "run-store.ts" -> "RunStore". */
function portNameOf(file: string): string {
  const words = file.replace(/\.ts$/, "").split("-");
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}

/** The README's port table as port name -> version. */
function readmeVersions(): Record<string, number> {
  const versions: Record<string, number> = {};
  for (const line of readme.split("\n")) {
    const row = /^\|\s*`(\w+)`\s*\|\s*`[\w-]+\.ts`\s*\|\s*(\d+)\s*\|/.exec(line);
    if (row?.[1] !== undefined && row[2] !== undefined) versions[row[1]] = Number(row[2]);
  }
  return versions;
}

verifies("ports.every-port-versioned", () => {
  it("finds the port files", () => {
    expect(portFiles.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of portFiles) {
    it(`${file} exports one version and portVersions lists it`, async () => {
      const exported: Record<string, unknown> = await import(`./${file}`);
      const versions = Object.entries(exported).filter(([name]) => name.endsWith("Version"));
      expect(versions, `${file} must export exactly one version constant`).toHaveLength(1);
      const [, version] = versions[0] ?? [];
      expect(
        Number.isInteger(version) && (version as number) > 0,
        `${file}'s version is a positive whole number`,
      ).toBe(true);
      expect(
        portVersions[portNameOf(file) as keyof typeof portVersions],
        `portVersions.${portNameOf(file)}`,
      ).toBe(version);
    });
  }

  it("lists no port without a file", () => {
    expect(Object.keys(portVersions).sort()).toEqual(portFiles.map(portNameOf).sort());
  });

  it("matches the README table", () => {
    expect(readmeVersions()).toEqual({ ...portVersions });
  });
});

/**
 * Every module path a source file names: `import … from`, `export … from`,
 * a bare `import "…"` and an `import("…")` type.
 */
function importedPaths(source: string): string[] {
  const patterns = [/\bfrom\s+"([^"]+)"/g, /\bimport\s+"([^"]+)"/g, /\bimport\(\s*"([^"]+)"\s*\)/g];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1] ?? ""),
  );
}

verifies("ports.web-types-only", () => {
  it("finds every kind of import, so the check below can't be got around", () => {
    const source = [
      'import type { A } from "./a.ts";',
      'export { B } from "@halonicjs/events";',
      'import "node:fs";',
      'type R = import("node:stream").Readable;',
    ].join("\n");
    expect(importedPaths(source)).toEqual([
      "./a.ts",
      "@halonicjs/events",
      "node:fs",
      "node:stream",
    ]);
  });

  const allowedImport = /^(\.\/[\w-]+\.ts|@halonicjs\/events)$/;
  const sourceFiles = readdirSync(sourceFolder).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );

  for (const file of sourceFiles) {
    it(`${file} imports only core packages and names no Node types`, () => {
      const source = readFileSync(`${sourceFolder}/${file}`, "utf8");
      expect(importedPaths(source).filter((path) => !allowedImport.test(path))).toEqual([]);
      expect(source).not.toMatch(/^\s*\/\/\/\s*<reference/m);
      expect(source).not.toMatch(/\bBuffer\b|\bNodeJS\.|\bprocess\.\w/);
    });
  }
});
