import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type CatalogEntry, loadCatalog } from "./catalog.ts";
import { aliasForRun } from "./run-alias.ts";
import { acmeModels, acmeRouter, repoCatalogTexts } from "./test-catalog.ts";

function entryOf(name: string, models = acmeModels): CatalogEntry {
  const loaded = loadCatalog({ models, router: acmeRouter });
  const entry = loaded.ok ? loaded.value.entries.get(name) : undefined;
  if (entry === undefined) {
    throw new Error(`no entry ${name}`);
  }
  return entry;
}

verifies("router.pinned-host", () => {
  it("sets the pinned host as OpenRouter's routing", () => {
    const loaded = loadCatalog(repoCatalogTexts());
    const deepseek = loaded.ok ? loaded.value.entries.get("deepseek-flash") : undefined;
    if (deepseek === undefined) {
      throw new Error("no deepseek-flash in the catalog");
    }
    expect(aliasForRun(deepseek).params.extra?.["provider"]).toEqual({
      order: ["deepinfra/fp8"],
      only: ["deepinfra/fp8"],
      allow_fallbacks: false,
      data_collection: "deny",
    });
  });

  it("keeps the alias's other extras", () => {
    const models = acmeModels.replace(
      "model: acme/open-flash",
      "model: acme/open-flash\n    params: { extra: { top_k: 40 } }",
    );
    const extra = aliasForRun(entryOf("cheap", models)).params.extra;
    expect(extra?.["top_k"]).toBe(40);
    expect(extra?.["provider"]).toMatchObject({ only: ["acme-host/fp8"] });
  });

  it("leaves an alias without a pinned host unchanged", () => {
    const smart = entryOf("smart");
    expect(aliasForRun(smart)).toBe(smart.alias);
  });
});
