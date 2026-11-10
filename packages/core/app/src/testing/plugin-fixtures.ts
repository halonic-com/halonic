// Plugins for the plugin service's tests: a weather plugin with every part,
// parsed by the real `plugin` kind, so the tests see the defaults it fills in.

import { type Plugin, parseFile } from "@halonicjs/format";
import type { PluginFileHash } from "../plugin-trust-content.ts";

/** The weather plugin from the plugins ADR, with a backend, one local tool and UI. */
export const weatherManifest = `id: weather
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
    - { name: post-report, description: Posts a weather report., risk: send, noun: { one: report, many: reports }, untrusted: false }
localTools:
  - id: files
    start:
      package: { runner: npx, name: "@acme/files-mcp", version: 3.1.4 }
    args: ["--read-only"]
    env:
      ACME_ROOT: { setting: root }
      ACME_KEY: { secret: acme-key }
    secrets:
      acme-key: { purpose: Reads your Acme account, hosts: [api.acme.com] }
    network: [api.acme.com]
    tools:
      - { name: list-files, description: Lists the files in a folder., risk: read, untrusted: true }
ui:
  settings:
    root: { label: Folder, type: text, required: true }
  commands:
    - { id: forecast, title: Show the forecast, tool: forecast }
`;

/**
 * Parses a manifest with the `plugin` kind.
 *
 * @throws when it has problems, naming them, so a broken fixture fails loudly
 */
export function pluginFrom(manifest: string = weatherManifest): Plugin {
  const parsed = parseFile("plugin", manifest);
  if (!parsed.ok) {
    throw new Error(parsed.error.map((problem) => problem.message).join("; "));
  }
  return parsed.value.value;
}

/** The weather plugin's files, by path and a made-up hash. */
export const weatherFiles: readonly PluginFileHash[] = [
  { path: "plugin.yaml", sha256: "a".repeat(64) },
  { path: "backend/index.js", sha256: "b".repeat(64) },
];
