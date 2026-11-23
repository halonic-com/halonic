# @halonicjs/tooling-router

The variant router's inputs and checks (goal HAL-16982). It starts with the provider catalog: the
models the router may pick from, with their price, data class and pinned host.

- **Layer:** tooling
- **Owner:** liam
- **Public API:** `@halonicjs/tooling-router`

## The provider catalog

Two files, next to each other:

| File | What it holds | Read with |
| --- | --- | --- |
| `providers.yaml` | the aliases, as a plain `models.yaml`: provider, model, list price, fallbacks | the workspace format's own `models.yaml` schema (`parseFile("models", …)`) |
| `providers.router.yaml` | what only the router needs per alias: `dataClass`, `status`, `pinnedHost` | the router's extension schema in `src/router-extension.ts` |

`providers.yaml` stays a valid `models.yaml`, so it can move to Halonic Code unchanged; the
router-only fields stay out of the public format. `loadCatalog` checks both files and the rules
across them (`requirements/provider-catalog.md`): every alias in both files, a price for every
alias, an open model only through its one pinned host, and fallbacks only within the same data class
and model.

- **Price version:** `catalog.priceVersion` is a hash of every alias's provider, model and price.
  Each cost row stores it, so a price change doesn't move older cost-per-pass numbers.
- **Pinned host:** the adapter calls `aliasForRun(entry)` when a run starts. It sets
  `params.extra.provider` from the catalog's `pinnedHost` (only that host, fallbacks off, data
  collection denied). The agent never sets it.

## Example

```ts
import { aliasForRun, loadCatalog } from "@halonicjs/tooling-router";

const catalog = loadCatalog({ models: providersYaml, router: providersRouterYaml });
if (catalog.ok) {
  const entry = catalog.value.entries.get("deepseek-flash");
  if (entry?.status === "approved") startRun(aliasForRun(entry), catalog.value.priceVersion);
}
```
