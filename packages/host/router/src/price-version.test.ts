import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadCatalog } from "./catalog.ts";
import { acmeModels, acmeRouter } from "./test/test-catalog.ts";

async function versionOf(models: string): Promise<string> {
  const loaded = await loadCatalog({ models, router: acmeRouter });
  if (!loaded.ok) {
    throw new Error(JSON.stringify(loaded.error));
  }
  return loaded.value.priceVersion;
}

verifies("router.price-version", () => {
  it("is prefixed and short", async () => {
    expect(await versionOf(acmeModels)).toMatch(/^prices-[0-9a-f]{12}$/);
  });

  it("stays the same when only order, comments or descriptions change", async () => {
    const reordered = `
# Same prices, written differently.
aliases:
  cheap:
    description: The open model.
    price: { output: 0.3, input: 0.1 }
    model: acme/open-flash
    provider: openrouter
  smart:
    provider: anthropic
    model: claude-opus-5-5
    price: { input: 4, output: 20 }
`;
    expect(await versionOf(reordered)).toBe(await versionOf(acmeModels));
  });

  it("changes with a price", async () => {
    const dearer = acmeModels.replace("output: 20", "output: 21");
    expect(await versionOf(dearer)).not.toBe(await versionOf(acmeModels));
  });

  it("changes with the model behind an alias", async () => {
    const otherModel = acmeModels.replace("claude-opus-5-5", "claude-opus-5");
    expect(await versionOf(otherModel)).not.toBe(await versionOf(acmeModels));
  });
});
