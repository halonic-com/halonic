import { verifies } from "@halonicjs/testing-spec";
import type {
  ConnectorTrustContent,
  IntegrationTrustContent,
  TrustChanges,
} from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { plainText } from "../messages/phrase.ts";
import { type FingerprintedCheck, trustCheckLines } from "./trust-check.ts";

// The trust check's rows for local integrations: their setting addresses, their folder and code,
// and the secrets their connectors pick. The rest of the check is in trust-check.test.ts.

const facts = { name: "Acme", folder: "./acme", sandboxWorks: true };
const fingerprint = "hfp1:c9b6e22b01f6cd3d69165343778b05c2f2c0c4e472d4d4eadeb6d073f5bc61ca";
// Noon UTC, so the day is 3 Nov in every time zone the tests run in.
const trustedAt = "2026-11-03T12:00:00.000Z";
const current = { fingerprint, unpinned: ["mail-mcp", "notes-mcp"] };

/** What every local integration's trust content has besides its id and addresses. */
const integrationBase = {
  folder: "integrations/my-crm",
  provides: ["connector"],
  hosts: {},
  secrets: [],
  googleScopes: [],
  tools: {},
  needs: [],
  code: "sha256:00",
};

const crm: IntegrationTrustContent = {
  id: "my-crm",
  ...integrationBase,
  addresses: {
    CRM_URL: "https://crm.example.com/",
    REPORTS_URL: null,
    WEBHOOK: "‹refused: the URL has user info›",
  },
};
const noChanges = { added: [], changed: [], removed: [], unchanged: 0 };

/** A connector that runs the local integration in `integrations/<folder>`, with its secret picks. */
const integrationConnector = (
  folder: string,
  secrets: Record<string, string>,
): ConnectorTrustContent => ({
  id: folder,
  transport: "integration",
  settings: { folder, secrets },
  tools: { approve: [] },
});

const lines = (check: FingerprintedCheck) => trustCheckLines(check, facts).map(plainText);

verifies("cli.trust-check", () => {
  it("lists a local integration's setting addresses under Addresses, one line each", () => {
    const check: FingerprintedCheck = {
      status: "new",
      content: { connectors: [], integrations: [crm] },
      fingerprint,
      unpinned: [],
    };
    expect(lines(check).slice(2)).toEqual([
      "Will list 3 addresses.",
      "",
      "Addresses",
      "  my-crm        CRM_URL       https://crm.example.com/",
      "                REPORTS_URL   not set",
      "                WEBHOOK       can't be used: the URL has user info",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("shows a changed setting address as one changed address", () => {
    const before = {
      id: "my-crm",
      ...integrationBase,
      addresses: { CRM_URL: "https://old.example.com/" },
    };
    const after = {
      id: "my-crm",
      ...integrationBase,
      addresses: { CRM_URL: "https://crm.example.com/" },
    };
    const changes: TrustChanges = {
      ...noChanges,
      agents: noChanges,
      integrations: {
        ...noChanges,
        changed: [{ id: "my-crm", before, after, fields: ["addresses"] }],
      },
      providers: noChanges,
      onlyRemoves: false,
    };
    const check: FingerprintedCheck = {
      status: "changed",
      content: { connectors: [], integrations: [after] },
      ...current,
      changes,
      trustedAt,
    };
    expect(lines(check).slice(0, 4)).toEqual([
      "What changed in Acme since you trusted it on 3 Nov",
      "1 changed address since you trusted this on 3 Nov.",
      "",
      "Addresses",
    ]);
    expect(lines(check)[4]).toBe("  my-crm        CRM_URL   https://crm.example.com/   Changed");
  });

  it("lists a local integration's connector by its folder, with each secret it picks by name", () => {
    const check: FingerprintedCheck = {
      status: "new",
      content: {
        connectors: [
          integrationConnector("notes", {
            "notes-key": "‹secret my-notes-key›",
            "api-key": "‹secret backup›",
            "sync-key": "‹secret sync-key›",
          }),
          integrationConnector("tasks", {}),
        ],
      },
      fingerprint,
      unpinned: [],
    };
    expect(lines(check).slice(2)).toEqual([
      "Will pass 3 secrets and list 2 addresses.",
      "",
      "Addresses",
      "  notes         integrations/notes · gets the secrets backup as api-key, my-notes-key as notes-key and sync-key",
      "  tasks         integrations/tasks",
      "",
      "Fingerprint",
      `  ${fingerprint}`,
    ]);
  });

  it("says a single picked secret in the singular, and never a value", () => {
    const check: FingerprintedCheck = {
      status: "new",
      content: {
        connectors: [integrationConnector("notes", { "notes-key": "‹secret my-notes-key›" })],
      },
      fingerprint,
      unpinned: [],
    };
    expect(lines(check)).toContain(
      "  notes         integrations/notes · gets the secret my-notes-key as notes-key",
    );
    expect(lines(check).join("\n")).not.toContain("‹secret");
  });

  it("tags a connector whose secret pick changed as a changed address", () => {
    const before = integrationConnector("notes", { "notes-key": "‹secret my-notes-key›" });
    const after = integrationConnector("notes", { "notes-key": "‹secret other-key›" });
    const changes: TrustChanges = {
      ...noChanges,
      changed: [{ id: "notes", before, after, fields: ["settings"] }],
      agents: noChanges,
      integrations: noChanges,
      providers: noChanges,
      onlyRemoves: false,
    };
    const check: FingerprintedCheck = {
      status: "changed",
      content: { connectors: [after] },
      ...current,
      changes,
      trustedAt,
    };
    expect(lines(check).slice(1, 5)).toEqual([
      "1 changed address since you trusted this on 3 Nov.",
      "",
      "Addresses",
      "  notes         integrations/notes · gets the secret other-key as notes-key   Changed",
    ]);
  });

  it("shows a moved local integration with changed files as its folder, then code changed", () => {
    const before = { id: "my-crm", ...integrationBase, addresses: {} };
    const after = { ...before, folder: "integrations/crm", code: "sha256:01" };
    const changes: TrustChanges = {
      ...noChanges,
      agents: noChanges,
      integrations: {
        ...noChanges,
        changed: [{ id: "my-crm", before, after, fields: ["code", "folder"] }],
      },
      providers: noChanges,
      onlyRemoves: false,
    };
    const check: FingerprintedCheck = {
      status: "changed",
      content: { connectors: [], integrations: [after] },
      ...current,
      changes,
      trustedAt,
    };
    expect(lines(check).slice(1, 6)).toEqual([
      "1 changed address since you trusted this on 3 Nov.",
      "",
      "Addresses",
      "  my-crm        folder integrations/my-crm → integrations/crm   Changed",
      "  my-crm        code changed   Changed",
    ]);
  });
});
