import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { manualFormProblems } from "@halonicjs/action-steppers";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { shippedCatalog, shippedDefinitions, sourceHashOf } from "./catalog.ts";

const sourceFolder = import.meta.dirname;

function sha256Of(key: string): string {
  return createHash("sha256")
    .update(readFileSync(join(sourceFolder, `${key}.ts`)))
    .digest("hex");
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

    it("carries the SHA-256 of each definition's source", () => {
      expect(sourceHashOf("github.upload-social-preview", 1)).toBe(
        sha256Of("github/upload-social-preview"),
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
