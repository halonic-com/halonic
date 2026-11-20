# @halonicjs/target-cloudflare-deploy

Deploys the Halonic Worker to Cloudflare: provision, migrate, upload, smoke test, switch traffic
(ADR 5.6, HAL-6704). `deploy()` runs the steps in order; the pieces (client, provision, migrate, lock, upload) are also exported.
`status`, `rollback` and `destroy` (HAL-6705) read what is live, switch back to the previous version, and remove what a deploy created;
`cloudflareSweeper` lists and deletes `hlt-` names for the live-test sweeper, through the same `deleteResource` call `destroy` uses. It first empties a bucket (`emptyBucket`: list and delete objects, page by page), because a run killed before its teardown leaves objects behind; `destroy` never does.
The deviations from ADR 5.6 are in `requirements/orchestrate.md`.

Each upload is pinned to the definitions snapshot the deploy wrote just before it, through the plain
variable `HALONIC_DEFINITIONS_VERSION`, so the live version keeps its own snapshot until traffic
switches, even when the new version's self-test fails. A `rollback` brings back the older version's
snapshot only while that snapshot is still in `<worker>-defs`: nothing prunes snapshots today, and any
future pruning must keep the snapshots of every version that can still be rolled back to.

- **Layer:** targets
- **Owner:** mateo
- **Public API:** `@halonicjs/target-cloudflare-deploy`

## Example

```ts
import { createCloudflareClient, resolveCredentials } from "@halonicjs/target-cloudflare-deploy";

const api = createCloudflareClient({ token });
const { accountId, kind } = await resolveCredentials(api, { token });
```

Everything above the client depends on the `CloudflareApi` port, so it tests with a fake. The token is
sent as a bearer header only and is replaced with `[redacted]` in every error.
