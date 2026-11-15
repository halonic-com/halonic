# Decision: the live suite deploys its own Worker into the CI account

- Approval: the task asks for this change (HAL-9962, for HAL-9955); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vDAQPX6FoeaUnHvNVhLqgh1BD5WJlbkarac0TOGc53eHWgY9dXfQjujXlvmvcAJMeHdJm6xzsIy1JhN8BpndAA==

## What changes

- `@halonicjs/testing-cloudflare-live` gets a fixture: a Vitest `globalSetup` that builds the Worker bundle, provisions `hlt-` named database and buckets, writes a snapshot with one webhook routine into the definitions bucket, uploads the Worker with its bindings and secrets, and deletes all of it when the suite ends or a step fails.
- New requirement `cloudflare-live.fixture`.
- A small REST client in the package for what `CloudflareApi` lacks: the D1 database id, the account's workers.dev subdomain, and R2 object put and delete.
- Dev dependencies on the deploy package, the runtime package (for its entry file), the storage adapter (the snapshot writer) and `tooling-publish` (the bundle build). The testing layer may use anything and is never a runtime dependency.

## Why

`test:live` failed with the names of three missing variables. The fixture sets them, so the suite runs in `live-cloud` without a hand-made Worker. It reuses `provision` and `uploadAndSwitch`, so the fixture deploys the way `halonic deploy` does, self-test included.

The definitions bucket is made by the fixture, not by `provision`, which makes only the database and the blobs bucket. The Worker creates its schema itself when it first opens the database, so the fixture runs no migrations.

## Tests

Seven unit tests run the fixture against an in-memory API and the REST client against a fake `fetch`: names, the one allowed host, cleanup at the end and after a failed upload, and a refused prefix. Nothing ran against Cloudflare, because the CI account's token isn't set up yet (HAL-6829). The R2 object endpoints, the D1 and subdomain reads and the first Worker upload are written against Cloudflare's documentation and get their first real check on the first live run. Until then, `LIVE_CLOUD_ENABLED` must stay off.

## Covers

- cloudflare-live.fixture
