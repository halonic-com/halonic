import type { TrustCheck } from "@halonicjs/app";
import type { TrustRowView } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import type { IntegrationTrustContent, TrustChanges } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { newAdditionLabel } from "./integration-trust-rows.ts";
import { trustReviewOf } from "./trust-review.ts";

// What a fix (I7) or an edit adds to a local integration, on Studio's "What changed" check: a
// "New:" line before each host, secret and tool it gained, and none for what it lost.

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

/** The check for `shop` changed from {@link trusted} to `after` in `fields`. */
function changedCheck(after: IntegrationTrustContent, fields: string[]): TrustCheck {
  const changes: TrustChanges = {
    ...noChanges,
    agents: noChanges,
    integrations: { ...noChanges, changed: [{ id: "shop", before: trusted, after, fields }] },
    providers: noChanges,
    onlyRemoves: false,
  };
  return {
    status: "changed",
    fingerprint: "hfp1:1",
    unpinned: [],
    content: { connectors: [], integrations: [after] },
    changes,
    trustedAt: "2026-11-03T12:00:00.000Z",
  } as unknown as TrustCheck;
}

function shopLines(check: TrustCheck): TrustRowView["lines"] {
  const review = trustReviewOf(check, { name: "Acme", folder: "/work/acme" });
  const section = review?.sections.find((each) => each.heading.startsWith("Integrations"));
  return section?.rows.find((row) => row.id === "shop")?.lines ?? [];
}

const newLines = (check: TrustCheck) =>
  shopLines(check).filter(([label]) => label === newAdditionLabel);

verifies("studio.trust-review-fix-additions", () => {
  it('shows "New:" before the host and the tool a fix added, first in the row', () => {
    const fixed: IntegrationTrustContent = {
      ...trusted,
      hosts: { ...trusted.hosts, "cdn.shopify.com": "public" },
      tools: { ...trusted.tools, "create-order": { risk: "write", untrusted: false } },
      code: "sha256:1",
    };

    expect(newAdditionLabel).toBe("New:");
    expect(shopLines(changedCheck(fixed, ["code", "hosts", "tools"])).slice(0, 2)).toEqual([
      ["New:", "can also reach cdn.shopify.com"],
      ["New:", "can also offer the tool create-order"],
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

    expect(newLines(changedCheck(fixed, ["addresses", "code", "hosts", "secrets"]))).toEqual([
      ["New:", "can also reach the address in the setting store_url"],
      ["New:", "can also get the secret shop-token"],
    ]);
  });

  it("shows nothing for a tool a fix removed, so the removal adds no question", () => {
    const { "list-products": _removed, ...kept } = trusted.tools;
    const fixed: IntegrationTrustContent = { ...trusted, tools: kept, code: "sha256:1" };
    const lines = shopLines(changedCheck(fixed, ["code", "tools"]));

    expect(lines.filter(([label]) => label === newAdditionLabel)).toEqual([]);
    expect(lines.some(([, text]) => text.includes("list-products"))).toBe(false);
  });
});
