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

## Configuration and wiring

`createRuntime(env)` builds every Cloudflare adapter from the Worker's `env`:
the Durable Object, D1 and R2 bindings that `wrangler.toml` declares (`COORDINATION`,
`RUN`, `ROUTINES`, `DB`, `BLOBS`, `DEFINITIONS`), and the secrets. A secret is a Workers secret
named `HALONIC_SECRET_<NAME>`: `token-key` is `HALONIC_SECRET_TOKEN_KEY` (32 random
bytes in base64url) and `serve-password` is `HALONIC_SECRET_SERVE_PASSWORD` (the
PBKDF2 hash `halonic deploy` makes). Nothing else in `env` is read as a secret.
When a binding or one of these two secrets is missing, `createRuntime` throws a
`ConfigurationError` naming what is missing, never a value. `fetch()` doesn't
use it yet: the health route needs no configuration and shows none. The rule is
the requirement `runtime.configuration`.

## What `scheduled()` does

`wrangler.toml` triggers the cron every minute. Each run asks the routines object
to tick for the cron's scheduled time, then sweeps the watchdog; the two are
independent, so one failing never skips the other. A failed tick or a run the
watchdog couldn't check makes `scheduled()` reject, with a message that names what
failed and never a value, so Cloudflare shows the cron run as failed. Until
`host/server` is on `main` (HAL-195) the routines object has no routine scheduler to
call: its `tickListener()` still throws until the Worker overrides it. The rule is the
requirement `runtime.scheduled`.

## The password limit

`runtime.passwords` is the chained PBKDF2 hasher behind `limitPasswordLength`: a
password over 1,024 bytes (NFC, in UTF-8) is refused before any PBKDF2 work, so a
long guess costs the Worker nothing. `verify` answers `false` and `hash` throws. The
rule is the requirement `runtime.password-limit`.

## Tests

`routes.test.ts` and `worker.node.test.ts` run in Node. `worker-scheduled.test.ts` runs the cron in workerd with a recording routines object. `worker.test.ts` runs
`src/test/worker.spec.ts` inside workerd through the part 1 harness
(`@halonicjs/target-cloudflare-testing`), against the real Worker and real
Durable Objects.
