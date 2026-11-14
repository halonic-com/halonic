# @halonicjs/target-cloudflare-deploy

Deploys the Halonic Worker to Cloudflare: provision, migrate, upload, smoke test, switch traffic
(ADR 5.6, HAL-6704). `deploy()` runs the steps in order; the pieces (client, provision, migrate, lock, upload) are also exported.
The deviations from ADR 5.6 are in `requirements/deploy.md`.

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
