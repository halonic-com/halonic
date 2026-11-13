# @halonicjs/target-cloudflare-runtime

The Halonic Worker on Cloudflare (HAL-6802, part 9 of HAL-197). `src/index.ts`
is the Worker: its default export has `fetch()`, and it re-exports the Durable
Object classes of `adapter-cloudflare-durable` under their fixed names.
`wrangler.toml` binds and migrates them.

- **Layer:** targets
- **Owner:** priya
- **Public API:** `@halonicjs/target-cloudflare-runtime`

## What `fetch()` answers today

Until `host/server` is on `main` (HAL-195), `fetch()` answers one route:
`GET` or `HEAD` on `/health` is 200 with `{"status":"ok"}`. The answer has no
version, no configuration and no name of anything bound, so a caller who isn't
signed in learns nothing about the deployment. Every other path is 404, every
other method on `/health` is 405, and no Studio file is served until the API
behind it exists (design review HAL-6790). The rule is the requirement
`runtime.health-route`.

## Durable Object classes

`wrangler.toml` lists the classes in one migration with SQLite storage. The
names are those of `durableObjectClassNames` and never change: Cloudflare
deletes an object's data with its class. `wrangler-config.test.ts` fails when
the migration, the bindings or the list differ, and `src/test/worker.spec.ts`
(run inside workerd) fails when the Worker stops exporting one. The rule is
`runtime.durable-object-migrations`.

## Tests

`routes.test.ts` and `worker.node.test.ts` run in Node. `worker.test.ts` runs
`src/test/worker.spec.ts` inside workerd through the part 1 harness
(`@halonicjs/target-cloudflare-testing`), against the real Worker and real
Durable Objects.
