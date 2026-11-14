# @halonicjs/target-cloudflare-deploy

Deploys the Halonic Worker to Cloudflare: provision, migrate, upload, smoke test, switch traffic
(ADR 5.6, HAL-6704). This first part holds the Cloudflare client and the token checks; later parts add
provisioning, migrations, the deploy lock, the upload and the orchestrator.

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
