# Cloudflare spend guard

A hard stop for Halonic's Cloudflare spend (HAL-3133). A Worker checks usage every 15 minutes and
turns a KV switch off at **$900** of estimated month-to-date spend. Every Worker that does billable
work reads that switch first and refuses when it is off.

Source: `src/`. Tests: `node --test infra/spend-guard/test/guard.test.mjs infra/turbo-cache/test.mjs` (no install, no
network, no spend). Nothing here is a pnpm package; it is deployed through the Cloudflare connection.

## The switch

KV namespace **`halonic-spend-guard`**, ID **`646a6e2ba633475da4ecf9502cd8ce25`** (account
`346227c5febeb134aaf2cee24096499b`).

| Key                  | Value        | Meaning                                                                                |
| -------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `spend_ok`           | `on` / `off` | Account-wide switch                                                                    |
| `spend_ok:<service>` | `on` / `off` | Per-service switch (`render`, `turbo-cache`)                                           |
| `state`              | JSON         | Month, estimated cost per product and service, last good read, and `offBy` (see below) |

`state.offBy` is `auto` only while the guard itself holds the switch off (`offReason` is `limit` or `no-usage`); `serviceOff.<service>.by` works the same way. A **manual** stop is a `spend_ok` set to `off` by hand: the guard never writes it, so `offBy` stays absent. That is how the month reset tells them apart: it undoes `auto` stops and leaves manual ones. When the guard sees `spend_ok` back on while `offBy` is set, it logs "manual resume noticed" and clears `offBy`.

Anything other than the exact string `on` counts as off: a missing key, a KV error, a missing binding.

### Stop and resume by hand

Tell Chief "stop Cloudflare spend" or "resume Cloudflare spend", or, with Wrangler logged in to the account:

```
# stop
npx wrangler kv key put --remote --namespace-id 646a6e2ba633475da4ecf9502cd8ce25 spend_ok off
# resume
npx wrangler kv key put --remote --namespace-id 646a6e2ba633475da4ecf9502cd8ce25 spend_ok on
```

A service switch works the same way: key `spend_ok:render`. Workers see the change within about 60 seconds
(KV edge cache). A manual stop is never undone by the month reset. If you resume while spend is still at or
over the trip, the guard stops it again within 15 minutes; to go past the limit on purpose, raise `TRIP_USD` on the guard Worker.

## Using it in a Worker

Bind the namespace as `SPEND_KV`, then:

```js
import { checkSpend, spendOffResponse } from "../spend-guard/src/check-spend.mjs";
if (!(await checkSpend(env, "render"))) return spendOffResponse(); // 503
```

`halonic-turbo-cache` does this (`infra/turbo-cache/worker.mjs`), after its auth check: unauthenticated requests get 401 and cost no KV read. Turbo treats the 503 as a cache miss and builds locally.

## What it does

- Cron `*/15 * * * *`. Reads month-to-date usage (UTC calendar month) from the GraphQL Analytics API, prices it, stores `state`.
- Telegram warnings at **$500** and **$800**, once each per month. **Off at $900** (the $100 margin covers lag and estimate error).
- Sub-budgets: **render $20**, **turbo-cache $5** per month. Going over turns off only that service's key. These are priced without free allowances, so they err high.
- Month reset: on the first run of a new month it turns the switch back on **only if it turned it off itself**.
- Fails safe: no readable usage (bad or missing token, API outage) sends a Telegram alert at once and turns `spend_ok` off after 3 hours. It switches back on by itself when usage is readable again and under the limit. It never reports all clear without data.
- Settings (Worker vars, all optional): `TRIP_USD`, `WARN_USD` (`500,800`), `SUB_BUDGETS_JSON`, `THRESHOLD_OVERRIDE` (test only).
- Secrets on the Worker: `CLOUDFLARE_SPEND_GUARD_TOKEN` (read-only: Account Analytics Read), `TELEGRAM_NEWS_TOKEN`, `TELEGRAM_NEWS_CHAT_ID`.

## Coverage list

No new Cloudflare product goes live before it is on this list and priced in `src/pricing.mjs` and `src/usage.mjs`.

| Product                 | In use            | Read from                                                                 | Notes                                                                                                                                                   |
| ----------------------- | ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers (requests, CPU) | yes               | `workersInvocationsAdaptive`                                              | plan fee $5 included                                                                                                                                    |
| R2 (storage, Class A/B) | yes               | `r2StorageAdaptiveGroups`, `r2OperationsAdaptiveGroups`                   | storage = peak size × elapsed part of month (high estimate)                                                                                             |
| KV                      | yes               | `kvOperationsAdaptiveGroups`, `kvStorageAdaptiveGroups`                   |                                                                                                                                                         |
| Workers AI              | no                | `aiInferenceAdaptiveGroups`                                               | read anyway                                                                                                                                             |
| Durable Objects | yes (HAL-3083) | `durableObjectsInvocationsAdaptiveGroups`, `durableObjectsPeriodicGroups` | `activeTime` µs × 0.125 GB; counted in the render sub-budget |
| Containers | yes (HAL-3083) | `containersUsageAdaptiveGroups`                                           | Units checked 11 Nov 2026 against real data: `cpuTimeSec` = vCPU-s, `allocatedMemory` = bytes×s (÷2³⁰ → GiB-s), `allocatedDisk` = bytes×s (÷10⁹ → GB-s). Counted in the render sub-budget |

Flip `live` in `src/usage.mjs` in the same pull request that ships the product (done for Containers and Durable Objects with HAL-3083). Any product not on the list (Queues, D1, Vectorize, Images, Stream, Browser Rendering...) is not covered.

## Prices used

Cloudflare's published pricing, as checked 10 Nov 2026 (`src/pricing.mjs`): Workers Paid plan $5/month;
Workers 10M requests + 30M CPU ms included, then $0.30 per M requests and $0.02 per M CPU ms;
R2 10 GB-month free then $0.015/GB-month, Class A $4.50/M after 1M free, Class B $0.36/M after 10M free (deletes free);
KV 10M reads / 1M writes / 1 GB free, then $0.50/M reads, $5.00/M writes, $0.50/GB-month;
Durable Objects 1M requests + 400k GB-s included, then $0.15/M and $12.50/M GB-s;
Workers AI $0.011 per 1,000 neurons after 10k neurons/day free;
Containers vCPU $0.000020/s, memory $0.0000025/GiB-s, disk $0.00000007/GB-s, with the monthly inclusions.
Sources: developers.cloudflare.com/workers/platform/pricing, /r2/pricing, /kv/platform/pricing, /durable-objects/platform/pricing, /workers-ai/platform/pricing, /containers/pricing.
Re-check these when Cloudflare changes pricing; the guard is only as good as this table.

The billing usage endpoint (`GET /accounts/{id}/billing/usage`) was checked and is **not used**: it returns
quantities for Workers requests and KV reads only, no dollars, and nothing for R2, Durable Objects or Containers.
The guard prices GraphQL quantities itself. Estimates assume one billing month = one UTC calendar month; if the
account's billing cycle starts on another day, the estimate can be high or low by up to a few days of spend.

## Lag and worst-case overshoot

Measured on 10 Nov 2026 by sending requests to `halonic-turbo-cache` and polling GraphQL (`workersInvocationsAdaptive`, per-minute rows):

| Sent                   | First visible in GraphQL                                   |
| ---------------------- | ---------------------------------------------------------- |
| 3 requests at 09:19:41 | within 61 s (not yet at 22 s)                              |
| 1 request at 09:20:49  | between 33 s and 125 s (not yet at 33 s, present at 125 s) |

So analytics lag is **about 1 to 2 minutes**. Billing-side lag (invoices, the dashboard's billing page) can be hours, which is why the guard prices
analytics quantities itself instead of waiting for billed amounts. KV propagation to the edge adds up to 60 s (cache TTL).

Worst case past the trip is the spend rate times the gap between real spend and the switch reaching every Worker:
15 min cron + about 2 min analytics lag + 1 min KV = **about 18 minutes**.

- Today's services at their own limits (turbo-cache $5/month cap; render, max 2 containers, roughly $0.15/hour): **cents**.
- A flood against a public Worker (no Cloudflare-side cap exists): 10,000 requests/s is 36M requests/hour. Each request is $0.30/M in Workers requests plus, if it reads the switch, up to two KV reads (`spend_ok` and the service key) at $0.50/M. That is about $11/hour for requests and up to about $36/hour for KV, **about $14 in 18 minutes** at the worst. The edge cache (60 s) makes the real KV count lower, but it is not relied on here. `halonic-turbo-cache` checks auth before the switch, so a flood without the token costs requests only, about $3 in 18 minutes.

Both are far below the $100 margin between the $900 trip and the $1,000 limit. The estimate itself can be off (calendar vs billing month, storage upper bound); the margin covers that too.

## Test with no real spend

`THRESHOLD_OVERRIDE=0.01` on a staging copy, or `node --test` (recorded usage, fake KV). The tests cover: the
trip, the Telegram message, the 503 refusal, manual resume, the month reset (automatic stop undone, manual stop kept), warnings
once each, sub-budgets, and the no-data fail-safe.
