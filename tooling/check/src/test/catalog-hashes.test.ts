import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { loadContext } from "../lib/context.ts";
import {
  checkCatalogHashes,
  expectedCatalogFile,
  readHashedCatalogs,
  renderCatalogFile,
} from "../rules/catalog-hashes.ts";
import { catalogSourceHash, sourceFiles } from "../rules/catalog-source-hash.ts";
import { manifestFor, removeFixtureRepo, writeFixtureRepo } from "./fixture-repo.ts";

// An invented catalog package for the acme organisation.
const directory = "packages/core/acme-catalog";
const generated = `${directory}/src/catalog.generated.ts`;
const definitionFile = `${directory}/src/acme/rotate-key.ts`;
const parametersFile = `${directory}/src/acme-parameters.ts`;
const patternFile = `${directory}/src/acme-pattern.ts`;

/** A fixture repo whose catalog file was written as `pnpm discover --fix` writes it, then `change` runs. */
function catalogErrors(change: (root: string) => void): string[] {
  const root = writeFixtureRepo(
    [
      {
        directory,
        manifest: manifestFor("@halonicjs/acme-catalog", "core", {
          halonic: { layer: "core", owner: "mateo", catalog: { export: "definition" } },
        }),
        files: {
          "src/index.ts": "export {};\n",
          "src/acme/rotate-key.ts":
            'import { keyName } from "../acme-parameters.ts";\nexport const definition = keyName;\n',
          "src/acme-parameters.ts":
            'import { pattern } from "./acme-pattern.ts";\nexport const keyName = { pattern };\n',
          "src/acme-pattern.ts": 'export const pattern = "^[a-z]+$";\n',
          "src/acme/rotate-key.test.ts": "export {};\n",
        },
      },
    ],
    { coreOrder: ["@halonicjs/acme-catalog"] },
  );
  try {
    const context = loadContext(root);
    const { catalogs, report } = readHashedCatalogs(context);
    const [catalog] = catalogs;
    if (catalog === undefined) throw new Error("the fixture declares a catalog");
    writeFileSync(join(root, generated), expectedCatalogFile(context, catalog, report));
    change(root);
    return checkCatalogHashes(loadContext(root)).problems.map(
      (problem) => `${problem.file}: ${problem.message}`,
    );
  } finally {
    removeFixtureRepo(root);
  }
}

verifies("check.catalog-hashes", () => {
  describe("catalog-hashes", () => {
    it("passes on the file pnpm discover --fix writes, and lists entries but not tests", () => {
      let text = "";
      expect(catalogErrors((root) => (text = readFileSync(join(root, generated), "utf8")))).toEqual(
        [],
      );
      expect(text).toContain('import { definition as acmeRotateKey } from "./acme/rotate-key.ts";');
      expect(text).toMatch(
        /"acme\/rotate-key": \{\n {4}definition: acmeRotateKey,\n {4}sourceHash: "[0-9a-f]{64}",/,
      );
      expect(text).not.toContain("rotate-key.test");
    });

    it("fails when a definition changed after the file was written", () => {
      const errors = catalogErrors((root) =>
        writeFileSync(join(root, definitionFile), 'export const definition = "rotate twice";\n'),
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`${generated}: Out of date`);
      expect(errors[0]).toContain('Run "pnpm discover --fix"');
    });

    it("fails when a shared file the definition imports changed", () => {
      const errors = catalogErrors((root) =>
        writeFileSync(join(root, parametersFile), 'export const keyName = { pattern: "" };\n'),
      );
      expect(errors).toEqual([expect.stringContaining(`${generated}: Out of date`)]);
    });

    it("fails when a file changed that the definition reaches through another import", () => {
      const errors = catalogErrors((root) =>
        writeFileSync(join(root, patternFile), 'export const pattern = "^.*$";\n'),
      );
      expect(errors).toEqual([expect.stringContaining(`${generated}: Out of date`)]);
    });

    it("hashes the definition first, then every file it reaches, sorted by path", () => {
      const sources: Record<string, string> = {
        "p/src/acme/rotate-key.ts": 'import "../b.ts";\nimport { a } from "../a.ts";\n',
        "p/src/a.ts": 'export * from "./b.ts";\n',
        "p/src/b.ts": 'const c = await import("./a.ts");\n',
      };
      const read = (file: string) => sources[file] ?? "";
      expect(sourceFiles("p/src/acme/rotate-key.ts", read)).toEqual([
        "p/src/acme/rotate-key.ts",
        "p/src/a.ts",
        "p/src/b.ts",
      ]);
      const before = catalogSourceHash("p", "p/src/acme/rotate-key.ts", read);
      // The same bytes moved from one file to the next still give a new hash.
      sources["p/src/a.ts"] = 'export * from "./b.ts";\nconst';
      sources["p/src/b.ts"] = ' c = await import("./a.ts");\n';
      expect(catalogSourceHash("p", "p/src/acme/rotate-key.ts", read)).not.toBe(before);
    });

    it("fails when a definition was added without running pnpm discover --fix", () => {
      const errors = catalogErrors((root) =>
        writeFileSync(
          join(root, `${directory}/src/acme/add-user.ts`),
          "export const definition = 1;\n",
        ),
      );
      expect(errors).toEqual([expect.stringContaining(`${generated}: Out of date`)]);
    });

    it("fails on a badly named entry file", () => {
      const errors = catalogErrors((root) =>
        writeFileSync(
          join(root, `${directory}/src/acme/Add_User.ts`),
          "export const definition = 1;\n",
        ),
      );
      expect(errors).toContain(
        `${directory}/src/acme/Add_User.ts: Name the folder and the file in lowercase words joined by hyphens.`,
      );
    });

    it("writes an empty catalog as the formatter would, so it lints clean", () => {
      const text = renderCatalogFile(
        { packageDirectory: directory, exportName: "definition" },
        [],
        () => "",
      );
      expect(text).toBe(
        [
          "// Generated by tooling/discover from src/<group>/<name>.ts. Do not edit; run pnpm discover --fix.",
          "",
          "/** Every `src/<group>/<name>.ts`, by `<group>/<name>`, with the SHA-256 of its source and its imports. */",
          "export const catalogEntries = {} as const;",
          "",
        ].join("\n"),
      );
    });
  });
});
