import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent, TrustChanges } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import type { PluginHosts } from "../sheet-hosts.ts";
import { type FingerprintedCheck, trustCheckLines } from "./trust-check.ts";

const fingerprint = "hfp1:c9b6e22b01f6cd3d69165343778b05c2f2c0c4e472d4d4eadeb6d073f5bc61ca";

/** A connector to the plugin acme-orders. */
const orders: ConnectorTrustContent = {
  id: "orders",
  transport: "plugin",
  settings: { id: "acme-orders" },
  tools: { approve: [] },
};
const noChanges = { added: [], changed: [], removed: [], unchanged: 0 };

/** The check's lines for a new workspace with only `orders`, with the plugins installed here. */
function newCheckLines(pluginHosts?: PluginHosts): string[] {
  const check: FingerprintedCheck = {
    status: "new",
    content: { connectors: [orders] },
    fingerprint,
    unpinned: [],
  };
  const facts = { name: "Acme", folder: "./acme", ...(pluginHosts ? { pluginHosts } : {}) };
  return trustCheckLines(check, facts).map(plainText);
}

verifies("cli.trust-check", () => {
  it("names a plugin connector's plugin and, under it, each host its installed backend lists once", () => {
    const pluginHosts: PluginHosts = new Map([
      [
        "acme-orders",
        ["api.acme.example", { fromSetting: "region_url", class: "public" }, "api.acme.example"],
      ],
    ]);

    expect(newCheckLines(pluginHosts).slice(2)).toEqual([
      "Will list 1 address.",
      "",
      "Addresses",
      "  orders        plugin acme-orders",
      "                Reaches api.acme.example and the address in the setting region_url.",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("shows only the plugin when it isn't installed here or its backend lists no host", () => {
    const row = "  orders        plugin acme-orders";

    expect(newCheckLines()).toContain(row);
    expect(newCheckLines(new Map([["acme-orders", []]])).slice(4, 6)).toEqual(["Addresses", row]);
    expect(newCheckLines(new Map([["other", ["api.other.example"]]]))).not.toContainEqual(
      expect.stringContaining("Reaches"),
    );
  });

  it("escapes a host from the plugin's manifest", () => {
    const lines = newCheckLines(new Map([["acme-orders", ["api.acme.example\u001b[2K"]]]));

    expect(lines).toContain("                Reaches api.acme.example\\u001b[2K.");
  });

  it("shows the hosts under a plugin connector that changed since it was trusted", () => {
    const changes: TrustChanges = {
      added: [],
      changed: [{ id: "orders", before: orders, after: orders, fields: ["tools"] }],
      removed: [],
      unchanged: 0,
      agents: noChanges,
      integrations: noChanges,
      providers: noChanges,
      onlyRemoves: false,
    };
    const check: FingerprintedCheck = {
      status: "changed",
      content: { connectors: [orders] },
      fingerprint,
      unpinned: [],
      changes,
      trustedAt: "2026-11-03T12:00:00.000Z",
    };
    const pluginHosts: PluginHosts = new Map([["acme-orders", ["api.acme.example"]]]);
    const lines = trustCheckLines(check, { name: "Acme", folder: "./acme", pluginHosts });

    expect(lines.map(plainText).slice(2, 6)).toEqual([
      "",
      "Addresses",
      "  orders        plugin acme-orders   Changed",
      "                Reaches api.acme.example.",
    ]);
  });
});
