import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ConnectorFactory,
  ConnectorFactoryContext,
  ConnectorPin,
  ConnectorTransport,
  TrustGrant,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const base = {
  secrets: { get: async () => null },
  tokens: { get: async () => null, set: async () => {}, remove: async () => {} },
  http: { fetch: async () => new Response("ok") },
};

const pin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/mail-mcp",
  version: "2.3.1",
};

describe("ports.connector-trust-inputs", () => {
  it("needs the trust grant, which is null for an untrusted workspace", () => {
    const grant: TrustGrant = { location: "/workspaces/acme", fingerprint: "hfp1:ab" };
    const trusted: ConnectorFactoryContext = { ...base, trust: grant };
    const untrusted: ConnectorFactoryContext = { ...base, trust: null };
    // @ts-expect-error: a caller must say whether the workspace is trusted
    const forgotten: ConnectorFactoryContext = { ...base };
    expectTypeOf<ConnectorFactoryContext["trust"]>().toEqualTypeOf<TrustGrant | null>();
    expectTypeOf<ConnectorFactory["create"]>()
      .parameter(1)
      .toEqualTypeOf<ConnectorFactoryContext>();
    expect([trusted.trust, untrusted.trust, forgotten]).toHaveLength(3);
  });

  it("pins a stdio connector, and only a stdio connector", () => {
    const stdio: ConnectorTransport = {
      kind: "stdio",
      command: "npx",
      args: ["-y", "@acme/mail-mcp"],
      env: {},
      pin,
    };
    const unpinned: ConnectorTransport = { kind: "stdio", command: "node", args: [], env: {} };
    const url = "https://mcp.acme.test";
    // @ts-expect-error: an HTTP connector downloads nothing, so it has no pin
    const http: ConnectorTransport = { kind: "http", url, headers: {}, pin };
    // @ts-expect-error: the built-in Google connector has no pin
    const google: ConnectorTransport = { kind: "google", account: "a", client: "c", pin };
    expect([stdio, unpinned, http, google]).toHaveLength(4);
  });

  it("names the registry kind and its address", () => {
    const pypi: ConnectorPin = { ...pin, registry: "pypi", registryUrl: "https://pypi.org" };
    // @ts-expect-error: only npm and PyPI packages are pinned
    const cargo: ConnectorPin = { ...pin, registry: "cargo" };
    // @ts-expect-error: the adapter must know where to look the version up
    const nowhere: ConnectorPin = { registry: "npm", package: "@acme/mail-mcp", version: "2.3.1" };
    expect([pypi, cargo, nowhere]).toHaveLength(3);
  });
});
