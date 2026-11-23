import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CatalogProblem, type CatalogTexts, loadCatalog } from "./catalog.ts";
import { acmeModels, acmeRouter, repoCatalogTexts } from "./test-catalog.ts";

/** The problems of a catalog that must fail, as `file path` pairs. */
function problemsOf(texts: CatalogTexts): CatalogProblem[] {
  const loaded = loadCatalog(texts);
  if (loaded.ok) {
    throw new Error("expected the catalog to fail");
  }
  return loaded.error;
}

function placesOf(texts: CatalogTexts): string[] {
  return problemsOf(texts).map((problem) => `${problem.file} ${problem.path}`);
}

verifies("router.provider-catalog", () => {
  it("loads the catalog in tooling/router with a data class and a price for every alias", () => {
    const loaded = loadCatalog(repoCatalogTexts());
    if (!loaded.ok) {
      throw new Error(JSON.stringify(loaded.error, null, 2));
    }
    const classes = [...loaded.value.entries.values()].map((entry) => [
      entry.name,
      entry.dataClass,
      entry.alias.price !== undefined,
    ]);
    expect(classes).toEqual([
      ["opus", "anthropic", true],
      ["sonnet", "anthropic", true],
      ["haiku", "anthropic", true],
      ["deepseek-flash", "open-pinned", true],
    ]);
  });

  it("fails for an alias that is in only one of the two files", () => {
    const models = `${acmeModels}  extra:\n    provider: anthropic\n    model: claude-haiku-4-5\n    price: { input: 1, output: 5 }\n`;
    expect(placesOf({ models, router: acmeRouter })).toEqual(["providers.yaml aliases.extra"]);
    const router = `${acmeRouter}  ghost: { dataClass: anthropic, status: trial }\n`;
    expect(placesOf({ models: acmeModels, router })).toEqual([
      "providers.router.yaml aliases.ghost",
    ]);
  });

  it("fails for an alias without a price", () => {
    const models = acmeModels.replace("    price: { input: 4, output: 20 }\n", "");
    expect(placesOf({ models, router: acmeRouter })).toEqual([
      "providers.yaml aliases.smart.price",
    ]);
  });

  it("fails for an open model without a pinned host, or one that pins itself", () => {
    const unpinned = acmeRouter.replace(", pinnedHost: acme-host/fp8", "");
    expect(placesOf({ models: acmeModels, router: unpinned })).toEqual([
      "providers.router.yaml aliases.cheap",
    ]);
    const selfPinned = acmeModels.replace(
      "model: acme/open-flash",
      "model: acme/open-flash\n    params: { extra: { provider: { only: [other-host] } } }",
    );
    expect(placesOf({ models: selfPinned, router: acmeRouter })).toEqual([
      "providers.yaml aliases.cheap.params.extra.provider",
    ]);
  });

  it("fails for a provider that doesn't fit the data class", () => {
    const models = acmeModels.replace("provider: openrouter", "provider: acme-direct");
    expect(placesOf({ models, router: acmeRouter })).toEqual([
      "providers.yaml aliases.cheap.provider",
    ]);
    const router = acmeRouter.replace(
      "smart: { dataClass: anthropic, status: approved }",
      "smart: { dataClass: anthropic, status: approved, pinnedHost: acme-host }",
    );
    expect(placesOf({ models: acmeModels, router })).toEqual([
      "providers.router.yaml aliases.smart.pinnedHost",
    ]);
  });

  it("fails for a fallback across data classes or models", () => {
    const models = acmeModels.replace(
      "price: { input: 0.1, output: 0.3 }",
      "$&\n    fallback: [smart]",
    );
    expect(placesOf({ models, router: acmeRouter })).toEqual([
      "providers.yaml aliases.cheap.fallback",
    ]);
  });

  it("fails for a fallback to a missing or less trusted alias", () => {
    const missing = acmeModels.replace(
      "price: { input: 4, output: 20 }",
      "$&\n    fallback: [gone]",
    );
    expect(placesOf({ models: missing, router: acmeRouter })).toEqual([
      "providers.yaml aliases.smart.fallback",
    ]);
    const models = `${acmeModels.replace("price: { input: 4, output: 20 }", "$&\n    fallback: [smart-2]")}  smart-2:\n    provider: anthropic\n    model: claude-opus-5-5\n    price: { input: 4, output: 20 }\n`;
    const router = `${acmeRouter}  smart-2: { dataClass: anthropic, status: trial }\n`;
    expect(placesOf({ models, router })).toEqual(["providers.yaml aliases.smart.fallback"]);
  });

  it("reports a file the format refuses with the format's own message and line", () => {
    const models = acmeModels.replace(
      "model: claude-opus-5-5",
      "model: claude-opus-5-5\n    modle: typo",
    );
    const [problem] = problemsOf({ models, router: acmeRouter });
    expect(problem).toMatchObject({ file: "providers.yaml", path: "aliases.smart", line: 6 });
    expect(problem?.message).toContain("modle");
  });

  it("reports a router field it doesn't know at its line", () => {
    const router = acmeRouter.replace("status: approved }", "status: maybe }");
    expect(problemsOf({ models: acmeModels, router })).toMatchObject([
      { file: "providers.router.yaml", path: "aliases.smart.status", line: 3 },
    ]);
  });
});

describe("loadCatalog", () => {
  it("reports text that isn't YAML", () => {
    expect(problemsOf({ models: acmeModels, router: "aliases: [" })).toMatchObject([
      { file: "providers.router.yaml", path: "" },
    ]);
  });
});
