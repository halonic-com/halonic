import { verifies } from "@halonicjs/testing-spec";
import type { IntegrationTrustContent, TrustChanges } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { type FingerprintedCheck, trustCheckLines } from "./trust-check.ts";

// What a fix (I7) or an edit adds to a local integration, on `halonic trust`'s changed check: a
// "New:" line for each host, secret and tool it gained, and none for what it lost.

const facts = { name: "Acme", folder: "./acme", sandboxWorks: true };

const trusted: IntegrationTrustContent = {
  id: "shop",
  folder: "integrations/shop",
  provides: ["connector"],
  hosts: { "api.shopify.com": "public" },
  secrets: [],
  googleScopes: [],
  tools: {
    "list-orders": { risk: "read", untrusted: false },
    "list-products": { risk: "read", untrusted: false },
  },
  needs: [],
  code: "sha256:0",
  addresses: {},
};

const noChanges = { added: [], changed: [], removed: [], unchanged: 0 };

/** The check's lines for `shop` changed from {@link trusted} to `after` in `fields`. */
function changedLines(after: IntegrationTrustContent, fields: string[]): string[] {
  const changes: TrustChanges = {
    ...noChanges,
    agents: noChanges,
    integrations: { ...noChanges, changed: [{ id: "shop", before: trusted, after, fields }] },
    providers: noChanges,
    onlyRemoves: false,
  };
  const check: FingerprintedCheck = {
    status: "changed",
    content: { connectors: [], integrations: [after] },
    fingerprint: "hfp1:1",
    unpinned: [],
    changes,
    trustedAt: "2026-11-03T12:00:00.000Z",
  };
  return trustCheckLines(check, facts).map(plainText);
}

const addressLines = (lines: string[]) =>
  lines.slice(lines.indexOf("Addresses") + 1, lines.indexOf("", lines.indexOf("Addresses")));

verifies("cli.trust-check-fix-additions", () => {
  it('shows "New:" before the host and the tool a fix added, under its Changed rows', () => {
    const fixed: IntegrationTrustContent = {
      ...trusted,
      hosts: { ...trusted.hosts, "cdn.shopify.com": "public" },
      tools: { ...trusted.tools, "create-order": { risk: "write", untrusted: false } },
      code: "sha256:1",
    };

    expect(addressLines(changedLines(fixed, ["code", "hosts", "tools"]))).toEqual([
      "  shop          code changed   Changed",
      "                New: can also reach cdn.shopify.com",
      "                New: can also offer the tool create-order",
    ]);
  });

  it('shows "New:" before a new secret and a new host from a setting', () => {
    const fixed: IntegrationTrustContent = {
      ...trusted,
      hosts: { ...trusted.hosts, "‹setting store_url›": "public" },
      secrets: [
        {
          secret: "‹secret shop-token›",
          hosts: ["api.shopify.com"],
          placement: { as: "bearer" },
          optional: false,
        },
      ],
      code: "sha256:1",
      addresses: { store_url: null },
    };
    const lines = changedLines(fixed, ["addresses", "code", "hosts", "secrets"]);

    expect(lines.filter((line) => line.includes("New:"))).toEqual([
      "                New: can also reach the address in the setting store_url",
      "                New: can also get the secret shop-token",
    ]);
  });

  it("shows nothing for a tool a fix removed, so the removal adds no question", () => {
    const { "list-products": _removed, ...kept } = trusted.tools;
    const fixed: IntegrationTrustContent = { ...trusted, tools: kept, code: "sha256:1" };

    expect(addressLines(changedLines(fixed, ["code", "tools"]))).toEqual([
      "  shop          code changed   Changed",
    ]);
  });
});
