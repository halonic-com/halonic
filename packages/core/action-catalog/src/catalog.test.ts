import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { manualFormProblems, routesOf } from "@halonicjs/action-steppers";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { shippedCatalog, shippedDefinitions, sourceHashOf } from "./catalog.ts";

const sourceFolder = import.meta.dirname;

/**
 * The hash as `pnpm discover --fix` writes it, over the given files under `src/`
 * in that order: each file's path in the package, its length in bytes, its bytes.
 */
function sha256Of(files: readonly string[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    const bytes = readFileSync(join(sourceFolder, file));
    hash.update(`src/${file}\n${bytes.byteLength}\n`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

verifies("action-catalog.discovery", () => {
  describe("shippedCatalog", () => {
    it("finds github.upload-social-preview@1 from its file, with no hand-edited list", () => {
      const keys = shippedDefinitions.map((entry) => entry.key);
      expect(keys).toContain("github/upload-social-preview");
      expect(shippedCatalog.definition("github.upload-social-preview", 1)?.title).toBe(
        "Upload a social preview image",
      );
    });

    it("has none for another version or an unknown id", () => {
      expect(shippedCatalog.definition("github.upload-social-preview", 2)).toBeUndefined();
      expect(shippedCatalog.definition("github.unknown", 1)).toBeUndefined();
      expect(sourceHashOf("github.unknown", 1)).toBeUndefined();
    });

    it("has no step types, and gives a step the route its definition builds", () => {
      expect(shippedCatalog.stepType("github.upload-social-preview", 1)).toBeUndefined();
      expect(shippedCatalog.route("github.upload-social-preview", 1, 1)).toMatchObject({
        kind: "guided",
        definition: "github.upload-social-preview",
        step: 1,
        address: "https://github.com/{owner}/{repo}/settings",
      });
      expect(shippedCatalog.route("github.upload-social-preview", 1, 2)).toBeUndefined();
      expect(shippedCatalog.route("github.unknown", 1, 1)).toBeUndefined();
    });

    it.each(shippedDefinitions)("$key builds a route for each of its steps", (entry) => {
      expect(() => routesOf(entry.definition)).not.toThrow();
    });

    it("carries the SHA-256 of a definition's source and the shared file it imports", () => {
      expect(sourceHashOf("github.upload-social-preview", 1)).toBe(
        sha256Of(["github/upload-social-preview.ts", "github-parameters.ts"]),
      );
    });

    it.each(shippedDefinitions)("names $key after its folder and file", (entry) => {
      const [service, name] = entry.key.split("/");
      expect(entry.definition.service).toBe(service);
      expect(entry.definition.id).toBe(`${service}.${name}`);
    });

    it.each(shippedDefinitions)("$key can be done by hand", (entry) => {
      expect(manualFormProblems(entry.definition)).toEqual([]);
    });

    it("has one entry per id and version", () => {
      const references = shippedDefinitions.map(
        ({ definition }) => `${definition.id}@${definition.version}`,
      );
      expect(new Set(references).size).toBe(references.length);
    });
  });
});
