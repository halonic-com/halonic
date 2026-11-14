# @halonicjs/target-cloudflare-deploy

Deploys the Halonic Worker to Cloudflare: provision, migrate, upload, smoke test, switch traffic
(ADR 5.6, HAL-6704). `deploy()` runs the steps in order; the pieces (client, provision, migrate, lock, upload) are also exported.
`status`, `rollback` and `destroy` (HAL-6705) read what is live, switch back to the previous version, and remove what a deploy created;
`cloudflareSweeper` lists and deletes `hlt-` names for the live-test sweeper, through the same `deleteResource` call `destroy` uses.
The deviations from ADR 5.6 are in `requirements/orchestrate.md`.

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
