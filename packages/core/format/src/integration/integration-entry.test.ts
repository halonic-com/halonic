import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as root from "../index.ts";
import { parsedValue } from "../test/parse.spec.ts";
import { IntegrationSheet, integrationPolicy, parseIntegrationSheet } from "./index.ts";

const fixtures = ["knowledge-mcp", "model-gemini", "tool-google-drive"];

function sheetText(name: string): string {
  return readFileSync(
    join(import.meta.dirname, "..", "kinds", "integration", "fixtures", `${name}.yaml`),
    "utf8",
  );
}

/** A sheet as the build writes it next to an integration: plain JSON data. */
function weather(): Record<string, unknown> {
  return {
    id: "weather",
    version: "1.0.0",
    kit: 1,
    provides: ["connector"],
    hosts: ["api.example.com"],
    secrets: {
      "weather-key": { purpose: "Reads the forecast.", hosts: ["api.example.com"], as: "bearer" },
    },
    tools: [{ name: "forecast", description: "The forecast.", risk: "read", untrusted: true }],
  };
}

/**
 * The relative files `entry` imports, followed transitively, and every
 * package it imports. The same walk as the recording entry's test.
 */
function importsOf(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) {
      return;
    }
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      if (specifier === undefined) {
        continue;
      }
      if (specifier.startsWith(".")) {
        visit(resolve(dirname(file), specifier));
      } else {
        packages.add(specifier);
      }
    }
  };
  visit(entry);
  return { files: [...files], packages: [...packages] };
}

verifies("format.integration-entry", () => {
  it.each(fixtures)("reads the %s sheet as data, the same as parseFile does", (name) => {
    const fromYaml = parsedValue("integration", sheetText(name));
    const fromData = parseIntegrationSheet(JSON.parse(JSON.stringify(fromYaml)));
    expect(fromData).toEqual({ ok: true, value: fromYaml });
  });

  it("fills in the defaults", () => {
    const parsed = parseIntegrationSheet(weather());
    expect(parsed.ok && [parsed.value.tokens, parsed.value.needs]).toEqual([[], []]);
  });

  it("refuses an unknown key at its place", () => {
    const parsed = parseIntegrationSheet({ ...weather(), network: "any" });
    expect(parsed.ok ? [] : parsed.error.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "unrecognized_keys", path: [] },
    ]);
  });

  it("runs the sheet's own checks: a secret for an undeclared host fails", () => {
    const sheet = weather();
    sheet["secrets"] = {
      "weather-key": { purpose: "x", hosts: ["files.example.com"], as: "bearer" },
    };
    const parsed = parseIntegrationSheet(sheet);
    expect(parsed.ok ? [] : parsed.error.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "secret-host-not-declared", path: ["secrets", "weather-key", "hosts", 0] },
    ]);
  });

  it("offers the same schema and policy as the package's main entry point", () => {
    expect(IntegrationSheet).toBe(root.IntegrationSheet);
    expect(integrationPolicy).toBe(root.integrationPolicy);
    expect(parseIntegrationSheet).toBe(root.parseIntegrationSheet);
  });

  it("loads no yaml: the entry imports only schema-kit and std, never parse-file.ts", () => {
    const { files, packages } = importsOf(join(import.meta.dirname, "index.ts"));
    expect(packages.sort()).toEqual(["@halonicjs/schema-kit", "@halonicjs/std"]);
    expect(files.some((file) => file.endsWith("parse-file.ts"))).toBe(false);
  });
});
