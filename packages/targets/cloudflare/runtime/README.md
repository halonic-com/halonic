# @halonicjs/target-cloudflare-runtime

The Halonic Worker on Cloudflare (HAL-6802, part 9 of HAL-197). `src/index.ts`
is the Worker: its default export has `fetch()`, and it re-exports the Durable
Object classes of `adapter-cloudflare-durable` under their fixed names.
`wrangler.toml` binds and migrates them.

- **Layer:** targets
- **Owner:** priya
- **Public API:** `@halonicjs/target-cloudflare-runtime`

## What `fetch()` answers

`GET` or `HEAD` on `/health` is 200 with `{"status":"ok"}`. The answer has no version, no
configuration and no name of anything bound, so a caller who isn't signed in learns nothing about the
deployment (requirement `runtime.health-route`). `POST /self-test` answers only for a deploy that set
its token (`runtime.self-test`).

Every other request goes to `host/server`'s handler with the Cloudflare adapters (HAL-9486,
requirement `runtime.serve`), so its rules apply as on any host: the `Host` and `Origin` checks, the
sign-in with the length-limited password check, the daily request ceiling and the one neutral 404 for
an unknown path. Three plain Worker variables (none is a secret) configure it:

| Variable | Meaning |
| --- | --- |
| `HALONIC_ALLOWED_HOSTS` | the `Host` names the API answers to, separated by commas. Any other name, such as a preview address, gets 421 and no API |
| `HALONIC_DEPLOYMENT_ID` | the deployment's id in `deployments.yaml` |
| `HALONIC_DAILY_REQUESTS` | optional: `limits.dailyRequests`, a whole number above zero |

A deployment that lacks a binding, a secret or one of the first two variables answers every request
except `/health` with 503 and a fixed body; the names of what is missing go to the Worker's log only.
The client's address is `CF-Connecting-IP`. The workspace is trusted, since the deployer uploaded it.
Starting a run answers 501 and no webhook is found yet: the Worker doesn't run workflows or load routines
from the snapshot yet.

## Export and import routes (the contract for the CLI)

`halonic deploy export` and `import` talk to the Worker through routes that exist only while a one-job
admin key is set (requirement `runtime.admin-key`, ADR 5.6). A normal deployment has none: `/admin/...` is
the same neutral 404 as any unknown path.

**The secret.** `admin-key-hash` (the Workers secret `HALONIC_SECRET_ADMIN_KEY_HASH`) holds the SHA-256 of
the key in lower-case hex, never the key. The CLI makes a key for the job (32 random bytes, base64url), sets
the secret to its hash, runs the job and removes the secret when the job ends, success or failure.

**Calling a route.** Send the key as `Authorization: Bearer <key>`, never in a URL, to one of the
deployment's own host names (`HALONIC_ALLOWED_HOSTS`), with no `Origin` header. A request to any other
name, such as a preview address, or with an `Origin`, never reaches a route. A missing or wrong key is 401
`{"code":"unauthorized","message":"..."}`. Every answer carries `Cache-Control: no-store`.

| Route | Request | Answer |
| --- | --- | --- |
| `GET /admin/export` | none | 200 JSON: the manifest of `@halonicjs/format/runtime-export` (`formatVersion`, `deployment`, `exportedAt`, `files` with `path`, `bytes`, `sha256`) |
| `GET /admin/export/files/<path>` | `<path>` is one of the manifest's paths (`runs/<run id>.jsonl`, `records/<hash>.jsonl`, `blobs/<xx>/<sha256>`) | 200 the file's bytes as `application/octet-stream`; 404 for a path the manifest doesn't list |
| `PUT /admin/import/files/<path>` | the file's bytes as the body, `<path>` in the same three shapes | 204; the file is only staged |
| `POST /admin/import` | the manifest as JSON | 200 `{"imported":{"runs":n,"records":n,"blobs":n}}` once every staged file matches the manifest's size and SHA-256 and is applied; 409 `{"code":"files_missing" or "files_differ","paths":[...]}` and nothing applied otherwise |

Today every one of these routes answers 501 `{"code":"not_implemented"}` after the key check: the answers come
in the next parts of HAL-9486, with the paths and shapes above unchanged. The CLI side can be written
against this table now.

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
`ConfigurationError` naming what is missing, never a value. `fetch()` builds it for every request except the health route. The rule is
the requirement `runtime.configuration`.

## What `scheduled()` does

`wrangler.toml` triggers the cron every minute. Each run asks the routines object
to tick for the cron's scheduled time, then sweeps the watchdog; the two are
independent, so one failing never skips the other. A failed tick or a run the
watchdog couldn't check makes `scheduled()` reject, with a message that names what
failed and never a value, so Cloudflare shows the cron run as failed. Until
`host/server` is wired to run workflows the routines object has no routine scheduler to
call: its `tickListener()` still throws until the Worker overrides it. The rule is the
requirement `runtime.scheduled`.

## The password limit

`runtime.passwords` is the chained PBKDF2 hasher behind `limitPasswordLength`: a
password over 1,024 bytes (NFC, in UTF-8) is refused before any PBKDF2 work, so a
long guess costs the Worker nothing. `verify` answers `false` and `hash` rejects. The
rule is the requirement `runtime.password-limit`.

## Tests

`routes.test.ts`, `serve.test.ts`, `admin.test.ts` and `worker.node.test.ts` run in Node. `serve-workerd.test.ts` runs the API in workerd with real Durable Objects. `worker-scheduled.test.ts` runs the cron in workerd with a recording routines object. `worker.test.ts` runs
`src/test/worker.spec.ts` inside workerd through the part 1 harness
(`@halonicjs/target-cloudflare-testing`), against the real Worker and real
Durable Objects.

`target.test.ts` runs the target contract suite from `@halonicjs/testing-contracts` (HAL-6803):
the contract of every port, built the way `createRuntime` builds it, and the capability refusals
(no port for programs or git, definitions and secrets that can only be read). Each case builds its
runtime with a `scope` (`runtime.scope`), which puts its blobs, snapshot and Durable Object names
under a name of its own on the shared bindings. The Durable Objects are the Worker's classes with a
clock the suite moves (`@halonicjs/adapter-cloudflare-durable/testing`). Refusal at validation and
run time (`capability-missing`) and the HTTP surface wait for the Worker to run workflows.
