import { verifies } from "@halonicjs/testing-spec";
import type { ConnectorTrustContent, IntegrationTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { trustReviewOf } from "./trust-review.ts";

const facts = { name: "Acme", folder: "/work/acme" };
const fingerprint = "hfp1:00";

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

verifies("studio.workspace-trust-review", () => {
  it("lists a local integration's connector by its folder, with each secret it picks by name", () => {
    const review = trustReviewOf(
      {
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
      },
      facts,
    );

    expect(review?.summary).toEqual(["Will pass 3 secrets and list 2 addresses."]);
    expect(review?.sections[0]?.rows).toEqual([
      {
        id: "notes",
        detail: "integrations/notes",
        lines: [["Gets secrets", "backup as api-key, my-notes-key as notes-key and sync-key"]],
      },
      { id: "tasks", detail: "integrations/tasks", lines: [] },
    ]);
    expect(JSON.stringify(review)).not.toContain("‹secret");
  });

  it("lists a local integration that reads no address from a setting once, by its connector (C552)", () => {
    const notes: IntegrationTrustContent = {
      id: "notes",
      folder: "integrations/notes",
      provides: ["connector"],
      hosts: { "notes.acme.test": "public" },
      secrets: [],
      googleScopes: [],
      tools: {},
      needs: [],
      code: "sha256:00",
      addresses: {},
    };
    const review = trustReviewOf(
      {
        status: "new",
        content: {
          connectors: [integrationConnector("notes", { "notes-key": "‹secret my-notes-key›" })],
          integrations: [notes, { ...notes, id: "crm", addresses: { CRM_URL: null } }],
        },
        fingerprint,
        unpinned: [],
      },
      facts,
    );

    expect(review?.summary).toEqual(["Will pass 1 secret and list 2 addresses."]);
    expect(review?.sections[0]).toMatchObject({ heading: "Addresses (2)" });
    expect(review?.sections[0]?.rows).toEqual([
      {
        id: "notes",
        detail: "integrations/notes",
        lines: [["Gets secrets", "my-notes-key as notes-key"]],
      },
      { id: "crm", detail: "", lines: [["CRM_URL", "not set"]] },
    ]);
  });
});
