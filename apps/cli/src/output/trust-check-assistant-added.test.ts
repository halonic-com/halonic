import type { AssistantAddedHosts } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import type { IntegrationTrustContent, TrustChanges } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { type FingerprintedCheck, trustCheckLines } from "./trust-check.ts";

// The "added by the assistant" mark in `halonic trust` (HAL-18397): the hosts the Studio's
// assistant added to a local integration's sheet that the person didn't name.

const fingerprint = "hfp1:c9b6e22b01f6cd3d69165343778b05c2f2c0c4e472d4d4eadeb6d073f5bc61ca";
// Noon UTC, so the day is 3 Nov in every time zone the tests run in.
const trustedAt = "2026-11-03T12:00:00.000Z";

const crm: IntegrationTrustContent = {
  id: "my-crm",
  folder: "integrations/my-crm",
  provides: ["connector"],
  hosts: { "crm.example.com": "public", "api.example.com": "public" },
  secrets: [],
  googleScopes: [],
  tools: {},
  needs: [],
  code: "sha256:01",
  addresses: { CRM_URL: "https://crm.example.com/" },
};

/** The assistant added `api.example.com`, and a host the sheet no longer has. */
const assistantAdded: AssistantAddedHosts = new Map([
  ["integrations/my-crm", new Set(["api.example.com", "old.example.com"])],
]);

const facts = { name: "Acme", folder: "./acme", sandboxWorks: true, assistantAdded };
const lines = (check: FingerprintedCheck) => trustCheckLines(check, facts).map(plainText);
const noChanges = { added: [], changed: [], removed: [], unchanged: 0 };

verifies("cli.trust-check-assistant-added-hosts", () => {
  it("lists the host the assistant added after the settings, with the mark, and counts it", () => {
    const check: FingerprintedCheck = {
      status: "new",
      content: { connectors: [], integrations: [crm] },
      fingerprint,
      unpinned: [],
    };
    expect(lines(check).slice(2)).toEqual([
      "Will list 2 addresses.",
      "",
      "Addresses",
      "  my-crm        CRM_URL           https://crm.example.com/",
      "                api.example.com   added by the assistant",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("lists it under Changed when only the integration's code changed", () => {
    const before = { ...crm, hosts: { "crm.example.com": "public" as const }, code: "sha256:00" };
    const changes: TrustChanges = {
      ...noChanges,
      agents: noChanges,
      integrations: {
        ...noChanges,
        changed: [{ id: "my-crm", before, after: crm, fields: ["code"] }],
      },
      providers: noChanges,
      onlyRemoves: false,
    };
    const check: FingerprintedCheck = {
      status: "changed",
      content: { connectors: [], integrations: [crm] },
      fingerprint,
      unpinned: [],
      changes,
      trustedAt,
    };
    expect(lines(check).slice(3, 6)).toEqual([
      "Addresses",
      "  my-crm        api.example.com   added by the assistant   Changed",
      "  my-crm        code changed   Changed",
    ]);
  });

  it("lists no host without marks, as before", () => {
    const check: FingerprintedCheck = {
      status: "new",
      content: { connectors: [], integrations: [crm] },
      fingerprint,
      unpinned: [],
    };
    const plain = trustCheckLines(check, { name: "Acme", folder: "./acme" }).map(plainText);
    expect(plain.slice(2, 6)).toEqual([
      "Will list 1 address.",
      "",
      "Addresses",
      "  my-crm        CRM_URL   https://crm.example.com/",
    ]);
  });
});
