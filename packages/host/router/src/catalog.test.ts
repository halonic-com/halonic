import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CatalogProblem, type CatalogTexts, loadCatalog } from "./catalog.ts";
import { acmeModels, acmeRouter } from "./test/test-catalog.ts";

/** The catalog's real files in `packages/host/router/`, as the router reads them. */
function repoCatalogTexts(): CatalogTexts {
  return {
    models: readFileSync(new URL("../providers.yaml", import.meta.url), "utf8"),
    router: readFileSync(new URL("../providers.router.yaml", import.meta.url), "utf8"),
  };
}

/** The problems of a catalog that must fail, as `file path` pairs. */
async function problemsOf(texts: CatalogTexts): Promise<CatalogProblem[]> {
  const loaded = await loadCatalog(texts);
  if (loaded.ok) {
    throw new Error("expected the catalog to fail");
  }
  return loaded.error;
}

async function placesOf(texts: CatalogTexts): Promise<string[]> {
  return (await problemsOf(texts)).map((problem) => `${problem.file} ${problem.path}`);
}

verifies("router.provider-catalog", () => {
  it("loads the catalog in packages/host/router with a data class and a price for every alias", async () => {
    const loaded = await loadCatalog(repoCatalogTexts());
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
    expect(loaded.value.entries.get("deepseek-flash")?.pinnedHost).toBe("deepinfra/fp8");
  });

  it("fails for an alias that is in only one of the two files", async () => {
    const models = `${acmeModels}  extra:\n    provider: anthropic\n    model: claude-haiku-4-5\n    price: { input: 1, output: 5 }\n`;
    expect(await placesOf({ models, router: acmeRouter })).toEqual([
      "providers.yaml aliases.extra",
    ]);
    const router = `${acmeRouter}  ghost: { dataClass: anthropic, status: trial }\n`;
    expect(await placesOf({ models: acmeModels, router })).toEqual([
      "providers.router.yaml aliases.ghost",
    ]);
  });

  it("fails for an alias without a price", async () => {
    const models = acmeModels.replace("    price: { input: 4, output: 20 }\n", "");
    expect(await placesOf({ models, router: acmeRouter })).toEqual([
      "providers.yaml aliases.smart.price",
    ]);
  });

  it("fails for an open model without a pinned host, or one that pins itself", async () => {
    const unpinned = acmeRouter.replace(", pinnedHost: acme-host/fp8", "");
    expect(await placesOf({ models: acmeModels, router: unpinned })).toEqual([
      "providers.router.yaml aliases.cheap",
    ]);
    const selfPinned = acmeModels.replace(
      "model: acme/open-flash",
      "model: acme/open-flash\n    params: { extra: { provider: { only: [other-host] } } }",
    );
    expect(await placesOf({ models: selfPinned, router: acmeRouter })).toEqual([
      "providers.yaml aliases.cheap.params.extra.provider",
    ]);
  });

  it("fails for a provider that doesn't fit the data class", async () => {
    const models = acmeModels.replace("provider: openrouter", "provider: acme-direct");
    expect(await placesOf({ models, router: acmeRouter })).toEqual([
      "providers.yaml aliases.cheap.provider",
    ]);
    const router = acmeRouter.replace(
      "smart: { dataClass: anthropic, status: approved }",
      "smart: { dataClass: anthropic, status: approved, pinnedHost: acme-host }",
    );
    expect(await placesOf({ models: acmeModels, router })).toEqual([
      "providers.router.yaml aliases.smart.pinnedHost",
    ]);
  });

  it("fails for a fallback across data classes or models", async () => {
    const models = acmeModels.replace(
      "price: { input: 0.1, output: 0.3 }",
      "$&\n    fallback: [smart]",
    );
    expect(await placesOf({ models, router: acmeRouter })).toEqual([
      "providers.yaml aliases.cheap.fallback",
    ]);
  });

  it("fails for a fallback to a missing or less trusted alias", async () => {
    const missing = acmeModels.replace(
      "price: { input: 4, output: 20 }",
      "$&\n    fallback: [gone]",
    );
    expect(await placesOf({ models: missing, router: acmeRouter })).toEqual([
      "providers.yaml aliases.smart.fallback",
    ]);
    const models = `${acmeModels.replace("price: { input: 4, output: 20 }", "$&\n    fallback: [smart-2]")}  smart-2:\n    provider: anthropic\n    model: claude-opus-5-5\n    price: { input: 4, output: 20 }\n`;
    const router = `${acmeRouter}  smart-2: { dataClass: anthropic, status: trial }\n`;
    expect(await placesOf({ models, router })).toEqual(["providers.yaml aliases.smart.fallback"]);
  });

  it("reports a file the format refuses with the format's own message and line", async () => {
    const models = acmeModels.replace(
      "model: claude-opus-5-5",
      "model: claude-opus-5-5\n    modle: typo",
    );
    const [problem] = await problemsOf({ models, router: acmeRouter });
    expect(problem).toMatchObject({ file: "providers.yaml", path: "aliases.smart", line: 6 });
    expect(problem?.message).toContain("modle");
  });

  it("reports a router field it doesn't know at its line", async () => {
    const router = acmeRouter.replace("status: approved }", "status: maybe }");
    expect(await problemsOf({ models: acmeModels, router })).toMatchObject([
      { file: "providers.router.yaml", path: "aliases.smart.status", line: 3 },
    ]);
  });
});

describe("loadCatalog", () => {
  it("reports text that isn't YAML", async () => {
    expect(await problemsOf({ models: acmeModels, router: "aliases: [" })).toMatchObject([
      { file: "providers.router.yaml", path: "" },
    ]);
  });
});
