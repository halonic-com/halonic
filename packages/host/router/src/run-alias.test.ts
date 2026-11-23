import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type CatalogEntry, loadCatalog } from "./catalog.ts";
import { aliasForRun } from "./run-alias.ts";
import { acmeModels, acmeRouter } from "./test/test-catalog.ts";

async function entryOf(name: string, models = acmeModels): Promise<CatalogEntry> {
  const loaded = await loadCatalog({ models, router: acmeRouter });
  const entry = loaded.ok ? loaded.value.entries.get(name) : undefined;
  if (entry === undefined) {
    throw new Error(`no entry ${name}`);
  }
  return entry;
}

verifies("router.pinned-host", () => {
  it("sets the pinned host as OpenRouter's routing", async () => {
    expect(aliasForRun(await entryOf("cheap")).params.extra?.["provider"]).toEqual({
      order: ["acme-host/fp8"],
      only: ["acme-host/fp8"],
      allow_fallbacks: false,
      data_collection: "deny",
    });
  });

  it("keeps the alias's other extras", async () => {
    const models = acmeModels.replace(
      "model: acme/open-flash",
      "model: acme/open-flash\n    params: { extra: { top_k: 40 } }",
    );
    const extra = aliasForRun(await entryOf("cheap", models)).params.extra;
    expect(extra?.["top_k"]).toBe(40);
    expect(extra?.["provider"]).toMatchObject({ only: ["acme-host/fp8"] });
  });

  it("leaves an alias without a pinned host unchanged", async () => {
    const smart = await entryOf("smart");
    expect(aliasForRun(smart)).toBe(smart.alias);
  });
});
