import {
  pluginTrustContent,
  pluginTrustSectionHeadings,
  pluginTrustSectionOrder,
  pluginTrustSections,
} from "@halonicjs/app";
import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { pluginTrustCheckHeadings, pluginTrustCheckLines } from "./plugin-trust-check.ts";

/** A plugin with something in every section of the trust check. Example data only. */
const weatherManifest = `id: weather
version: 1.2.0
sdk: 1
name: Weather
description: Forecasts for the places you name.
backend:
  hosts: [api.example.com]
  secrets:
    example-key:
      purpose: The forecast service's API key
      hosts: [api.example.com]
      as: header
      header: x-api-key
  tools:
    - { name: forecast, description: The forecast for one place., risk: read, untrusted: true }
localTools:
  - id: files
    start:
      package: { runner: npx, name: "@acme/files-mcp", version: 3.1.4 }
    network: [api.acme.com]
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
ui:
  commands:
    - { id: forecast, title: Show the forecast, tool: forecast }
`;

const folder = "/profile/plugins/weather";

function weatherContent(paths: readonly string[] = []) {
  const parsed = parseFile("plugin", weatherManifest);
  if (!parsed.ok) throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  return pluginTrustContent({
    plugin: parsed.value.value,
    files: ["plugin.yaml", ...paths].map((path) => ({ path, sha256: "a".repeat(64) })),
  });
}

/** The sections the CLI shows: all of Studio's but "In Studio" (HAL-6417). */
const shownByCli = <T extends string>(sections: readonly T[]) =>
  sections.filter((section) => section !== "in-studio");

// The parity check of P8 (HAL-1741): `halonic plugin add` and Studio's trust
// check read their sections, order and headings from the same model. Studio's
// trust dialog runs the same check against its own words.
verifies("app.plugin-trust-sections", () => {
  it("has each section's heading word for word as the shared model", () => {
    const headings = pluginTrustCheckHeadings();
    for (const section of shownByCli(pluginTrustSectionOrder)) {
      expect(headings[section]).toBe(pluginTrustSectionHeadings[section]);
    }
  });

  it("shows the plugin's sections in the shared model's order, each under its heading", () => {
    const content = weatherContent();
    const known = new Set(Object.values(pluginTrustSectionHeadings));
    const lines = pluginTrustCheckLines(content, folder).map(plainText);
    const shownHeadings = lines.filter((line) => known.has(line));
    expect(shownHeadings).toEqual(
      shownByCli(pluginTrustSections(content)).map(
        (section) => pluginTrustSectionHeadings[section],
      ),
    );
    expect(shownHeadings).toEqual(["Tools for agents", "Programs", "Secrets", "Addresses"]);
  });
});

verifies("app.plugin-trust-sections", () => {
  const linesOf = (paths: readonly string[]) =>
    pluginTrustCheckLines(weatherContent(paths), folder).map(plainText);

  it("shows the plugin's folder and the files its fingerprint covers", () => {
    const lines = linesOf(["backend/index.js"]);
    const start = lines.indexOf("Folder");
    expect(lines.slice(start, start + 6)).toEqual([
      "Folder",
      `  ${folder}`,
      "",
      "Files the fingerprint covers",
      "  backend/index.js",
      "",
    ]);
  });

  it("names the first ten files and says how many more", () => {
    const paths = Array.from(
      { length: 13 },
      (_, index) => `backend/file-${String(index).padStart(2, "0")}.js`,
    );
    const lines = linesOf(paths);
    const start = lines.indexOf("Files the fingerprint covers");
    expect(lines.slice(start + 1, start + 12)).toEqual([
      ...paths.slice(0, 10).map((path) => `  ${path}`),
      "  and 3 more",
    ]);
  });

  it("leaves out the file list for a plugin with only its manifest", () => {
    expect(linesOf([])).not.toContain("Files the fingerprint covers");
  });

  it("escapes control characters in the folder and in a file name", () => {
    const lines = pluginTrustCheckLines(
      weatherContent(["backend/\u001b[31mred.js"]),
      "/x/\u001b[2Jplugin",
    ).map(plainText);
    expect(lines).toContain("  /x/\\u001b[2Jplugin");
    expect(lines).toContain("  backend/\\u001b[31mred.js");
    expect(lines.join("\n")).not.toContain("\u001b");
  });
});
