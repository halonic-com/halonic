import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { manifest as seatsManifest } from "../seats/plugin/manifest.ts";
import { dataManifestSource } from "./data-manifest.ts";
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
});
