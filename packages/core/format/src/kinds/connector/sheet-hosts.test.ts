import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorIsLocalWith, pluginHosts } from "../../index.ts";
import { parsedValue, yaml } from "../../test/parse.spec.ts";

/** A local tool's lines under `localTools:`, reaching `network`. */
function localTool(id: string, network: readonly string[]): string[] {
  return [
    `  - id: ${id}`,
    "    start: { script: { program: node, path: tools/server.js } }",
    `    network: [${network.join(", ")}]`,
    "    tools:",
    "      - { name: list-files, description: Lists the files., risk: read, untrusted: true }",
  ];
}

/** The plugin acme-orders, with a backend reaching `backend` when given, and these local tools. */
function plugin(backend: readonly string[] | undefined, tools: readonly string[][]) {
  const lines = ["id: acme-orders", "version: 1.0.0", "sdk: 1", "name: Acme orders"];
  if (backend !== undefined) {
    lines.push(
      "backend:",
      `  hosts: [${backend.join(", ")}]`,
      "  tools:",
      "    - { name: find-order, description: Finds an order., risk: read, untrusted: true }",
    );
  }
  if (tools.length > 0) lines.push("localTools:", ...tools.flat());
  return parsedValue("plugin", yaml(...lines));
}

const orders = parsedValue(
  "connector",
  yaml("id: orders", "local: true", "transport: { plugin: { id: acme-orders } }"),
);

verifies("workspace.local-only-sheet-hosts", () => {
  it("lists the backend's hosts, then each local tool's sites it doesn't have yet", () => {
    const both = plugin(
      ["api.acme.example"],
      [localTool("lister", ["files.acme.example", "api.acme.example"])],
    );

    expect(pluginHosts(both)).toEqual(["api.acme.example", "files.acme.example"]);
  });

  it("doesn't count a connector as local when only a local tool reaches an outside site", () => {
    const hosts = pluginHosts(plugin([], [localTool("lister", ["api.public.example"])]));
    const sheets = { plugins: new Map([["acme-orders", hosts]]), integrations: new Map() };

    expect(hosts).toEqual(["api.public.example"]);
    expect(connectorIsLocalWith(orders, sheets)).toBe(false);
  });

  it("counts a connector as local when the plugin has only local tools that reach nothing", () => {
    const hosts = pluginHosts(plugin(undefined, [localTool("lister", [])]));
    const sheets = { plugins: new Map([["acme-orders", hosts]]), integrations: new Map() };

    expect(hosts).toEqual([]);
    expect(connectorIsLocalWith(orders, sheets)).toBe(true);
  });
});
