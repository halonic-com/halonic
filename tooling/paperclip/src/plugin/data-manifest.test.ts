import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, test } from "vitest";
import { manifest as seatsManifest } from "../seats/plugin/manifest.ts";
import { dataManifestSource, writeDataManifest } from "./data-manifest.ts";
import { manifest } from "./manifest.ts";

verifies("paperclip.data-only-manifest", () => {
  test("writes the Agent tools and seats manifests as one JSON literal and nothing else", () => {
    for (const each of [manifest, seatsManifest]) {
      const source = dataManifestSource(each);
      const body = source.replace(/^\/\/.*\n/, "");
      expect(body.startsWith("export const manifest = {")).toBe(true);
      expect(body.endsWith("};\nexport default manifest;\n")).toBe(true);
      const literal = body.slice(
        "export const manifest = ".length,
        body.indexOf(";\nexport default"),
      );
      expect(JSON.parse(literal)).toEqual(each);
    }
  });

  test("refuses a manifest that isn't plain JSON data", () => {
    expect(() => dataManifestSource({ id: "acme", run: () => 1 })).toThrow("not plain JSON data");
    expect(() => dataManifestSource({ id: "acme", when: new Date(0) })).toThrow(
      "not plain JSON data",
    );
  });

  test("refuses a __proto__ key at any depth", () => {
    const top = JSON.parse('{"id":"acme","__proto__":{"x":1}}');
    const deep = JSON.parse(
      '{"id":"acme","instanceConfigSchema":{"properties":{"__proto__":{"type":"string"}}}}',
    );
    expect(() => dataManifestSource(top)).toThrow("__proto__");
    expect(() => dataManifestSource(deep)).toThrow(
      "__proto__ key at manifest.instanceConfigSchema.properties",
    );
  });

  const folder = mkdtempSync(path.join(tmpdir(), "acme-data-manifest-"));
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  test("the written file imports as the same manifest under both exports", async () => {
    const file = path.join(folder, "manifest.js");
    await writeDataManifest(file, manifest);
    const loaded = (await import(pathToFileURL(file).href)) as {
      default: unknown;
      manifest: unknown;
    };
    expect(loaded.default).toEqual(manifest);
    expect(loaded.manifest).toBe(loaded.default);
  });
});
