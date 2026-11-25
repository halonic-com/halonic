# @halonicjs/host-router

The variant router's logic (goal HAL-16982), runtime-neutral so it can ship in Halonic Code. It
starts with the provider catalog: the models the router may pick from, with their price, data class
and pinned host. It reads no files itself: the caller passes the catalog's text.

- **Layer:** host
- **Owner:** liam
- **Public API:** `@halonicjs/host-router`

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

## Provider health (hard rule 7)

`ProviderHealth` keeps the health of every alias from the results of its model calls. Five
provider failures in a row, or more than half of at least 10 calls in 10 minutes, take an alias out
for 15 minutes (`defaultHealthLimits`). A refused key, an empty account or a budget cap is not a
provider failure and gets no fallback. The caller owns the instance and passes the time with every
call, so nothing here runs a timer.

`removeUnhealthyWorkflows` is hard rule 7: it removes every workflow with any step on an alias
that is out, and names what it removed for the decision's `ruleHits`. It never swaps a step for
another alias. When nothing is left, the router gives the task the fallback. When a step ends
because its provider is down, the plugin asks for a new route with the same `attempt` and the
failure `"provider_down"`, and this rule decides whether the same workflow is still allowed.

## Cost per run (`route_outcomes`)

`routeOutcomeOf(runRecord, catalog)` turns one Paperclip run record (`GET /api/heartbeat-runs/:id`)
into the cost part of its `route_outcomes` row (architecture note section 6; Q2 to Q4 in section 10).
Paperclip's run record is the source of truth for cost; there is no second log.

- **Which runs:** only a finished run whose process started and whose routing stamp
  (`contextSnapshot.halonicRouting`, written by the server at run start, HAL-16985) names a variant
  and a catalog alias. A run that failed before its process started may carry a stamp from its
  wake, so it is skipped as `not-started`. Unrouted (`variant: null`), unstamped and unfinished runs
  are skipped too, each with its reason.
- **Cost:** the list price from the catalog (seat runs too), the paid cost (0 for a seat run, else
  the reported cost), the reported cost and the catalog's `priceVersion`. `costDrift` flags a
  reported cost more than 10% away from the list price.
- **Provider down:** a run that ended with `provider_down` keeps its cost but has
  `trainingEvidence: false`.
- **Decision:** `decisionId` and `stepIndex` stay `null` until the router step at assignment stamps
  them; the configuration is looked up through the decision, not copied onto the row.

## Example

```ts
import { aliasForRun, loadCatalog } from "@halonicjs/host-router";

const catalog = await loadCatalog({ models: providersYaml, router: providersRouterYaml });
if (catalog.ok) {
  const entry = catalog.value.entries.get("deepseek-flash");
  if (entry?.status === "approved") startRun(aliasForRun(entry), catalog.value.priceVersion);
}
```
