import type { RequestLogLine } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import type { DefinitionSource } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";
import { connectorTroubles } from "./connector-troubles.ts";

const files: Readonly<Record<string, string>> = {
  "integrations/shop-orders/integration.yaml": `id: shop
version: 0.1.0
kit: 1
provides: [connector]
hosts: [shop.example.com]
tools:
  - { name: list_orders, description: The orders., risk: read, untrusted: true }
`,
};

const workspace: DefinitionSource = {
  location: "memory:acme",
  list: async (dir) =>
    Object.keys(files).filter((path) => dir === undefined || path.startsWith(`${dir}/`)),
  read: async (path) => files[path] ?? null,
  version: async () => "3f2c1ab",
};

const connectors = [
  { id: "orders", transport: { integration: { folder: "shop-orders" } } },
  { id: "notes", transport: { command: "notes-mcp" } },
] as unknown as readonly Connector[];

const notFound: readonly RequestLogLine[] = [
  {
    type: "request",
    at: "2026-11-26T09:00:00.000Z",
    method: "GET",
    host: "shop.example.com",
    path: "/orders",
    status: 404,
    durationMs: 12,
    outcome: "ok",
  },
  { type: "failure", at: "2026-11-26T09:00:00.000Z", tool: "list_orders", kind: "unavailable" },
];

describe("connectorTroubles", () => {
  it("reads a local integration's log by the id its sheet names, for its connector only", async () => {
    const asked: string[] = [];
    const troubles = await connectorTroubles(workspace, connectors, async (id) => {
      asked.push(id);
      return notFound;
    });
    expect(asked).toEqual(["shop"]);
    expect([...troubles]).toEqual([
      ["orders", { kind: "not-found", host: "shop.example.com", fields: [] }],
    ]);
  });

  it("gives no trouble when the log can't be read, or without logs", async () => {
    const failing = async (): Promise<never> => {
      throw new Error("no log");
    };
    expect((await connectorTroubles(workspace, connectors, failing)).size).toBe(0);
    expect((await connectorTroubles(workspace, connectors, undefined)).size).toBe(0);
  });
});
