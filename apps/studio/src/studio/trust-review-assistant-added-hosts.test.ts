import type { AssistantAddedHosts, TrustCheck, TrustService } from "@halonicjs/app";
import type { DefinitionSource, Digest, FolderReader } from "@halonicjs/ports";
import type { TrustRowView } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import type { IntegrationTrustContent } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { assistantAddedMark } from "./integration-trust-rows.ts";
import { trustReviewOf } from "./trust-review.ts";
import { WorkspaceTrust } from "./workspace-trust.ts";

const station: IntegrationTrustContent = {
  id: "home-station",
  folder: "integrations/home-station",
  provides: ["connector"],
  hosts: { "api.weather.example": "public", "cdn.weather.example": "public" },
  secrets: [],
  googleScopes: [],
  tools: {},
  needs: [],
  code: "sha256:1",
  addresses: {},
};

/** The assistant added `cdn.weather.example` to home-station's sheet, and a host it no longer has. */
const marks: AssistantAddedHosts = new Map([
  ["integrations/home-station", new Set(["cdn.weather.example", "old.weather.example"])],
]);

const facts = { name: "Acme", folder: "/work/acme", assistantAdded: marks };

function reachesOf(check: TrustCheck): TrustRowView["lines"] | undefined {
  const section = trustReviewOf(check, facts)?.sections.find((each) =>
    each.heading.startsWith("Integrations"),
  );
  // The Reaches row only: a changed row's "New:" lines are in fix-trust-changes.test.ts.
  return section?.rows[0]?.lines.filter(
    ([label, text]) => label === "Reaches" || (label === "" && text.includes("weather")),
  );
}

verifies("studio.trust-review-assistant-added-hosts", () => {
  it("puts the mark after the host the assistant added in the Reaches row, and after no other", () => {
    const check = {
      status: "new",
      fingerprint: "hfp1:1",
      unpinned: [],
      content: { connectors: [], integrations: [station] },
    } as unknown as TrustCheck;

    expect(assistantAddedMark).toBe("added by the assistant");
    expect(reachesOf(check)).toEqual([
      ["Reaches", "api.weather.example"],
      ["", "cdn.weather.example · added by the assistant"],
    ]);
  });

  it("marks it in a changed integration's row too", () => {
    const before = {
      ...station,
      hosts: { "api.weather.example": "public" as const },
      code: "sha256:0",
    };
    const check = {
      status: "changed",
      fingerprint: "hfp1:2",
      unpinned: [],
      trustedAt: "2026-11-03T12:00:00.000Z",
      content: { connectors: [], integrations: [station] },
      changes: {
        added: [],
        changed: [],
        removed: [],
        unchanged: 0,
        integrations: {
          added: [],
          changed: [{ id: station.id, before, after: station, fields: ["code"] }],
          removed: [],
        },
        agents: { added: [], changed: [], removed: [] },
        providers: { added: [], changed: [], removed: [] },
      },
    } as unknown as TrustCheck;

    expect(reachesOf(check)).toEqual([
      ["Reaches", "api.weather.example"],
      ["", "cdn.weather.example · added by the assistant"],
    ]);
  });

  it("reads the marks again on each change and tells the window, without checking trust again", async () => {
    const trust = new WorkspaceTrust({
      definitions: {} as DefinitionSource,
      folder: {} as FolderReader,
      findCommand: async () => undefined,
      digest: {} as Digest,
      trust: {} as TrustService,
    });
    let told = 0;
    trust.subscribe(() => {
      told += 1;
    });
    let recorded: AssistantAddedHosts = new Map();
    let fire = () => {};
    trust.followAssistantAdded(
      async () => recorded,
      (listener) => {
        fire = listener;
        return () => {};
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(trust.assistantAdded.size).toBe(0);

    recorded = marks;
    fire();
    await Promise.resolve();
    await Promise.resolve();

    expect(trust.assistantAdded).toBe(marks);
    expect(told).toBe(2);
    expect(trust.check).toBeUndefined();
  });
});
