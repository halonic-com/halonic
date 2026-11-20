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

/**
 * A plugin whose backend signs in to a self-hosted Acme server, at the
 * address in the setting `server`, with a client secret. The `plugin` kind
 * still refuses a backend with sign-ins until the host runs them (HAL-8613),
 * so it is built as the kind would fill it in. Example data only.
 */
export function signInPlugin(): Plugin {
  const plugin = pluginFrom(`id: acme
version: 1.0.0
sdk: 2
name: Acme
description: Your Acme projects.
backend:
  hosts: [{ fromSetting: server, class: public }]
  tools:
    - { name: list-projects, description: Lists your projects., risk: read, untrusted: true }
ui:
  settings:
    server: { label: Server address, type: text, required: true }
`);
  const backend = plugin.backend;
  if (backend === undefined) throw new Error("the fixture has a backend");
  return {
    ...plugin,
    backend: {
      ...backend,
      secrets: { "acme-client": { purpose: "The Acme app's client secret" } },
      signIns: {
        account: {
          purpose: "Your Acme projects",
          flow: "oauth-code",
          authorizeUrl: { fromSetting: "server", path: "/oauth/authorize" },
          tokenUrl: { fromSetting: "server", path: "/oauth/token" },
          revokeUrl: "https://revoke.example.com/oauth/revoke",
          clientId: "example-client",
          clientSecret: "acme-client",
          clientAuth: "post",
          scopes: [{ scope: "read_api", reason: "read your projects" }],
          access: { hosts: [{ fromSetting: "server" }], as: "bearer" },
        },
      },
    },
  };
}
